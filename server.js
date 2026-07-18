const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');
const chatbot = require('./chatbot');
const automation = require('./automation');
const pdfGenerator = require('./pdfGenerator');
const multer = require('multer');
const { PDFParse } = require('pdf-parse');
const fs = require('fs');
require('dotenv').config();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'supersecret_formfiller_token_12345';

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// JWT Authentication Middleware
async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required.' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token.' });
    }
    req.user = user;
    next();
  });
}

// -------------------------------------------------------------
// Auth Routes
// -------------------------------------------------------------

// User Registration
app.post('/api/auth/register', async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'All fields are required.' });
  }

  try {
    // Check if user already exists
    const existingUsers = await db.query('SELECT * FROM Users WHERE username = ? OR email = ?', [username, email]);
    if (existingUsers.length > 0) {
      return res.status(400).json({ error: 'Username or email already registered.' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Default first user to admin, others to user
    const userCountResult = await db.query('SELECT COUNT(*) AS count FROM Users');
    const role = userCountResult[0].count === 0 ? 'admin' : 'user';

    // Insert user
    const result = await db.query(
      'INSERT INTO Users (username, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [username, email, passwordHash, role]
    );

    const userId = result.insertId;

    // Create admin record if admin role
    if (role === 'admin') {
      await db.query('INSERT INTO Admin (user_id, permission_level) VALUES (?, ?)', [userId, 'superadmin']);
    }

    // Generate token
    const token = jwt.sign({ id: userId, username, email, role }, JWT_SECRET, { expiresIn: '24h' });

    res.status(201).json({
      message: 'Registration successful.',
      token,
      user: { id: userId, username, email, role }
    });

  } catch (error) {
    console.error('Registration error:', error.message);
    res.status(500).json({ error: 'Server error during registration.' });
  }
});

// User Login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  try {
    // Find user
    const users = await db.query('SELECT * FROM Users WHERE email = ?', [email]);
    if (users.length === 0) {
      return res.status(400).json({ error: 'Invalid email or password.' });
    }

    const user = users[0];

    // Check password
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid email or password.' });
    }

    // Generate token
    const token = jwt.sign({ id: user.id, username: user.username, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '24h' });

    res.json({
      message: 'Login successful.',
      token,
      user: { id: user.id, username: user.username, email: user.email, role: user.role }
    });

  } catch (error) {
    console.error('Login error:', error.message);
    res.status(500).json({ error: 'Server error during login.' });
  }
});

// -------------------------------------------------------------
// Form Routes
// -------------------------------------------------------------

// Get list of all forms
app.get('/api/forms', authenticateToken, async (req, res) => {
  try {
    const forms = await db.query('SELECT id, form_name, form_url, fields_schema FROM Forms');
    
    // Parse fields_schema string to JSON objects
    const parsedForms = forms.map(f => ({
      ...f,
      fields_schema: JSON.parse(f.fields_schema)
    }));

    res.json(parsedForms);
  } catch (error) {
    console.error('Fetch forms error:', error.message);
    res.status(500).json({ error: 'Server error retrieving forms.' });
  }
});

// -------------------------------------------------------------
// Chatbot & Form Filling Routes
// -------------------------------------------------------------

// Chat and detail extraction
app.post('/api/chat', authenticateToken, async (req, res) => {
  const { message, formId } = req.body;
  const userId = req.user.id;

  if (!message || !formId) {
    return res.status(400).json({ error: 'Message and formId are required.' });
  }

  try {
    // 1. Fetch the form schema
    const forms = await db.query('SELECT form_name, fields_schema FROM Forms WHERE id = ?', [formId]);
    if (forms.length === 0) {
      return res.status(404).json({ error: 'Form template not found.' });
    }
    const form = forms[0];
    const fieldsSchema = JSON.parse(form.fields_schema);

    // 2. Fetch conversation history for this user & form
    // Limit to last 20 messages to keep context window clean
    const chatHistory = await db.query(
      'SELECT sender, message FROM Chat_History WHERE user_id = ? ORDER BY timestamp ASC LIMIT 20',
      [userId]
    );

    // 3. Save user's message to Chat_History
    await db.query('INSERT INTO Chat_History (user_id, sender, message) VALUES (?, ?, ?)', [userId, 'user', message]);

    // Fetch any previously extracted form data to inform chatbot
    const existingFormData = await db.query(
      'SELECT id, extracted_json FROM Form_Data WHERE user_id = ? AND form_id = ?',
      [userId, formId]
    );
    const previouslyExtracted = existingFormData.length > 0 ? JSON.parse(existingFormData[0].extracted_json) : {};

    // 4. Process chatbot response using Gemini API or Mock Parser, passing previously extracted details
    const aiResult = await chatbot.processChat(message, chatHistory, fieldsSchema, previouslyExtracted);

    console.log(`--------------------------------------------------`);
    console.log(`[Chat API] Message: "${message}"`);
    console.log(`[Chat API] Extracted (newly):`, JSON.stringify(aiResult.extractedData));
    console.log(`[Chat API] Reply: "${aiResult.reply}"`);
    console.log(`--------------------------------------------------`);

    // 5. Save bot's reply to Chat_History
    await db.query('INSERT INTO Chat_History (user_id, sender, message) VALUES (?, ?, ?)', [userId, 'bot', aiResult.reply]);

    // 6. Update Form_Data table with the accumulated extracted details
    const updatedData = { ...previouslyExtracted, ...aiResult.extractedData };

    if (existingFormData.length > 0) {
      await db.query(
        'UPDATE Form_Data SET extracted_json = ?, status = ? WHERE id = ?',
        [JSON.stringify(updatedData), 'pending', existingFormData[0].id]
      );
    } else {
      await db.query(
        'INSERT INTO Form_Data (user_id, form_id, extracted_json, status) VALUES (?, ?, ?, ?)',
        [userId, formId, JSON.stringify(updatedData), 'pending']
      );
    }


    // Re-check missing fields based on merged data
    const finalMissing = fieldsSchema
      .filter(field => field.required && updatedData[field.name] === undefined)
      .map(field => field.name);

    res.json({
      reply: aiResult.reply,
      extractedData: updatedData,
      missingFields: finalMissing
    });

  } catch (error) {
    console.error('Chat routing error:', error.message);
    res.status(500).json({ error: 'Server error processing chatbot message.' });
  }
});

// Clear Chat History for session refresh
app.post('/api/chat/clear', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const { formId } = req.body;
  try {
    await db.query('DELETE FROM Chat_History WHERE user_id = ?', [userId]);
    if (formId) {
      await db.query('DELETE FROM Form_Data WHERE user_id = ? AND form_id = ?', [userId, formId]);
    } else {
      await db.query('DELETE FROM Form_Data WHERE user_id = ?', [userId]);
    }
    console.log(`[Chat API] Chat history and Form Data cleared for user session: ${userId}, form: ${formId || 'all'}`);
    res.json({ message: 'Chat history cleared successfully.' });
  } catch (error) {
    console.error('Clear chat error:', error.message);
    res.status(500).json({ error: 'Failed to clear chat history.' });
  }
});

// Retrieve Chat History for user
app.get('/api/chat/history', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  try {
    const history = await db.query(
      'SELECT sender, message FROM Chat_History WHERE user_id = ? ORDER BY timestamp ASC',
      [userId]
    );
    res.json(history);
  } catch (error) {
    console.error('Fetch chat history error:', error.message);
    res.status(500).json({ error: 'Failed to retrieve chat history.' });
  }
});

// Multilingual Translation Endpoint
app.post('/api/translate', async (req, res) => {
  const { text, sourceLang } = req.body;

  if (!text || !sourceLang) {
    return res.status(400).json({ error: 'text and sourceLang parameters are required.' });
  }

  try {
    const translatedText = await chatbot.translateToEnglish(text, sourceLang);
    res.json({
      success: true,
      original: text,
      translation: translatedText,
      sourceLang
    });
  } catch (err) {
    console.error('Translation endpoint error:', err.message);
    res.status(500).json({ error: 'Failed to translate. ' + err.message });
  }
});

// AI Voice-Based Universal Form Filling Entity Extractor Endpoint
app.post('/api/voice-extract', async (req, res) => {
  const { text, fields } = req.body;

  if (!text) {
    return res.status(400).json({ error: 'Text parameter is required.' });
  }

  try {
    const extractedResult = await chatbot.extractEntitiesFromVoice(text, fields);
    res.json({
      success: true,
      data: extractedResult
    });
  } catch (err) {
    console.error('Voice extraction endpoint error:', err.message);
    res.status(500).json({ error: 'Failed to extract entities. ' + err.message });
  }
});

// Retrieve extracted form details for user
app.get('/api/forms/data/:formId', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const { formId } = req.params;
  try {
    const rows = await db.query(
      'SELECT extracted_json FROM Form_Data WHERE user_id = ? AND form_id = ?',
      [userId, formId]
    );
    let data = {};
    if (rows.length > 0) {
      data = JSON.parse(rows[0].extracted_json);
    }
    
    // Check if resume file exists on disk
    const resumePath = path.join(__dirname, 'public', 'uploads', 'resume.pdf');
    if (fs.existsSync(resumePath)) {
      data.resume = 'resume.pdf';
    }
    
    res.json(data);
  } catch (error) {
    console.error('Fetch form data error:', error.message);
    res.status(500).json({ error: 'Failed to retrieve form details.' });
  }
});

// Manually update/override a form data field
app.post('/api/forms/data', authenticateToken, async (req, res) => {
  const { formId, fieldName, fieldValue } = req.body;
  const userId = req.user.id;

  if (!formId || !fieldName) {
    return res.status(400).json({ error: 'formId and fieldName are required.' });
  }

  try {
    const existing = await db.query(
      'SELECT id, extracted_json FROM Form_Data WHERE user_id = ? AND form_id = ?',
      [userId, formId]
    );

    let data = {};
    if (existing.length > 0) {
      data = JSON.parse(existing[0].extracted_json);
    }

    if (fieldValue === null || fieldValue === undefined || String(fieldValue).trim() === '') {
      delete data[fieldName];
    } else {
      data[fieldName] = String(fieldValue).trim();
    }

    if (existing.length > 0) {
      await db.query(
        'UPDATE Form_Data SET extracted_json = ? WHERE id = ?',
        [JSON.stringify(data), existing[0].id]
      );
    } else {
      await db.query(
        'INSERT INTO Form_Data (user_id, form_id, extracted_json) VALUES (?, ?, ?)',
        [userId, formId, JSON.stringify(data)]
      );
    }

    console.log(`[Chat API] Manually updated field "${fieldName}" to "${fieldValue}" for user: ${userId}`);
    res.json({ success: true, extractedData: data });

  } catch (err) {
    console.error('Manual field update error:', err.message);
    res.status(500).json({ error: 'Failed to update field value.' });
  }
});


// Trigger Selenium autofill in the browser
app.post('/api/forms/fill', authenticateToken, async (req, res) => {
  const { formId } = req.body;
  const userId = req.user.id;

  if (!formId) {
    return res.status(400).json({ error: 'formId is required.' });
  }

  try {
    // 1. Fetch form url
    const forms = await db.query('SELECT form_name, form_url FROM Forms WHERE id = ?', [formId]);
    if (forms.length === 0) {
      return res.status(404).json({ error: 'Form template not found.' });
    }
    
    // 2. Fetch the current extracted details
    const formDataEntries = await db.query(
      'SELECT id, extracted_json FROM Form_Data WHERE user_id = ? AND form_id = ?',
      [userId, formId]
    );

    if (formDataEntries.length === 0) {
      return res.status(400).json({ error: 'No extracted details found to fill this form. Please chat with the bot first.' });
    }

    const formDataEntry = formDataEntries[0];
    const dataToFill = JSON.parse(formDataEntry.extracted_json);

    // Resolve URL. Serving files from Express local server
    const targetUrl = `http://localhost:${PORT}${forms[0].form_url}`;

    // 3. Update database status to filled
    await db.query('UPDATE Form_Data SET status = ? WHERE id = ?', ['filled', formDataEntry.id]);

    // 4. Run Selenium Automation in the background
    // We launch it as an async task so the API response returns immediately (visual browser pops up in local server env)
    // Avoid blocking the Node event loop.
    setTimeout(async () => {
      try {
        await automation.autoFillForm(targetUrl, dataToFill);
        console.log(`[Selenium] Automation successfully finished filling form ${formId} for user ${userId}.`);
        // Optionally update status to 'submitted' if form is reviewed
        await db.query('UPDATE Form_Data SET status = ? WHERE id = ?', ['submitted', formDataEntry.id]);
      } catch (err) {
        console.error('[Selenium] Background execution failed:', err.message);
        await db.query('UPDATE Form_Data SET status = ? WHERE id = ?', ['failed', formDataEntry.id]);
      }
    }, 500);

    res.json({
      success: true,
      message: 'Form-filling automation launched. A browser window will open shortly to perform the filling.'
    });

  } catch (error) {
    console.error('Autofill route error:', error.message);
    res.status(500).json({ error: 'Server error launching form automation.' });
  }
});

// -------------------------------------------------------------
// Report Generation Routes
// -------------------------------------------------------------

// Download filled form details PDF
app.get('/api/reports/pdf/:formId', authenticateToken, async (req, res) => {
  const { formId } = req.params;
  const userId = req.user.id;

  try {
    // Get form data and form name
    const dataRows = await db.query(
      `SELECT fd.extracted_json, f.form_name, u.username, u.email 
       FROM Form_Data fd 
       JOIN Forms f ON fd.form_id = f.id
       JOIN Users u ON fd.user_id = u.id
       WHERE fd.user_id = ? AND fd.form_id = ?`,
      [userId, formId]
    );

    if (dataRows.length === 0) {
      return res.status(404).send('<h1>No form data found to generate PDF report.</h1>');
    }

    const { extracted_json, form_name, username, email } = dataRows[0];
    const data = JSON.parse(extracted_json);

    // Set Response headers for PDF attachment download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=form_report_${formId}.pdf`);

    // Call PDF generator to pipe output to express response object
    pdfGenerator.generateFormPDF(data, username, email, form_name, res);

  } catch (error) {
    console.error('PDF report route error:', error.message);
    res.status(500).send('Server error generating report.');
  }
});

// Upload and parse document route (Resume/Aadhar etc.)
app.post('/api/documents/upload', authenticateToken, upload.single('resume'), async (req, res) => {
  const userId = req.user.id;
  
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }

  try {
    let documentText = '';
    const fileMime = req.file.mimetype;
    
    if (fileMime === 'application/pdf') {
      const dataBuffer = req.file.buffer;
      const parser = new PDFParse({ data: dataBuffer });
      const pdfResult = await parser.getText();
      await parser.destroy();
      documentText = pdfResult.text;
    } else if (fileMime === 'text/plain') {
      documentText = req.file.buffer.toString('utf8');
    } else {
      return res.status(400).json({ error: 'Unsupported file type. Only PDF and TXT files are accepted.' });
    }

    // In mock mode, if document is scanned/empty, we bypass and use mock text to trigger fallback
    if (!documentText.trim()) {
      if (!process.env.GEMINI_API_KEY) {
        documentText = 'Demo Scanned PDF Document';
      } else {
        return res.status(400).json({ error: 'Document appears to be empty or has no selectable text.' });
      }
    }

    console.log(`[Document API] Parsing document text (${documentText.length} chars) for user: ${userId}`);
    fs.writeFileSync(path.join(__dirname, 'uploaded_pdf_text.txt'), documentText, 'utf8');

    // Call chatbot module to extract fields, passing username and email for mock fallback
    const extractedData = await chatbot.extractProfileFromText(documentText, req.user.username, req.user.email);
    
    if (!extractedData || Object.keys(extractedData).length === 0) {
      return res.status(422).json({ error: 'Failed to extract any useful profile information from the document.' });
    }

    console.log('[Document API] Extracted Data:', extractedData);

    // Save extracted details for ALL forms (ID 1, 2, 3) in the Form_Data database
    const formIds = [1, 2, 3];
    for (const formId of formIds) {
      const existing = await db.query(
        'SELECT id, extracted_json FROM Form_Data WHERE user_id = ? AND form_id = ?',
        [userId, formId]
      );
      
      let mergedData = { ...extractedData };
      if (existing.length > 0) {
        const previouslyExtracted = JSON.parse(existing[0].extracted_json);
        mergedData = { ...extractedData, ...previouslyExtracted };
        await db.query(
          'UPDATE Form_Data SET extracted_json = ?, status = ? WHERE id = ?',
          [JSON.stringify(mergedData), 'pending', existing[0].id]
        );
      } else {
        await db.query(
          'INSERT INTO Form_Data (user_id, form_id, extracted_json, status) VALUES (?, ?, ?, ?)',
          [userId, formId, JSON.stringify(mergedData), 'pending']
        );
      }
    }

    // Insert an automated bot notification into Chat_History
    let detailsString = Object.entries(extractedData)
      .map(([key, val]) => `<b>${key}</b>: ${val}`)
      .join(', ');
    
    const botMessage = `[Document Upload] I have successfully parsed your uploaded file <b>${req.file.originalname}</b> and updated your profile details: ${detailsString}`;
    await db.query('INSERT INTO Chat_History (user_id, sender, message) VALUES (?, ?, ?)', [userId, 'bot', botMessage]);

    // Write physical file to public/uploads/resume.pdf
    const uploadsDir = path.join(__dirname, 'public', 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    if (fileMime === 'application/pdf') {
      fs.writeFileSync(path.join(uploadsDir, 'resume.pdf'), req.file.buffer);
      console.log('[Document API] Saved original PDF resume to disk.');
    } else {
      // Generate a beautiful PDF dynamically from the extracted text variables
      const pdfPath = path.join(uploadsDir, 'resume.pdf');
      const writeStream = fs.createWriteStream(pdfPath);
      pdfGenerator.generateFormPDF(extractedData, req.user.username, req.user.email, 'Uploaded Text Resume Profile', writeStream);
      console.log('[Document API] Generated PDF resume from parsed text.');
    }

    extractedData.resume = 'resume.pdf';

    res.json({
      success: true,
      message: 'Document successfully parsed and profile updated.',
      extractedData
    });

  } catch (err) {
    console.error('Document upload/parse error:', err.message);
    res.status(500).json({ error: 'Failed to upload and parse the document. ' + err.message });
  }
});

// Upload physical PDF resume file only (Slot 2)
app.post('/api/documents/upload-resume', authenticateToken, upload.single('resume'), async (req, res) => {
  const userId = req.user.id;
  
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }

  if (req.file.mimetype !== 'application/pdf') {
    return res.status(400).json({ error: 'Only PDF resume files are accepted for form uploads.' });
  }

  try {
    const uploadsDir = path.join(__dirname, 'public', 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    // Save physical PDF to disk
    fs.writeFileSync(path.join(uploadsDir, 'resume.pdf'), req.file.buffer);
    console.log(`[Document API] Uploaded resume.pdf file to disk for user ${userId}.`);

    // Register resume file in database profile mapping for all forms (1, 2, 3)
    const formIds = [1, 2, 3];
    for (const formId of formIds) {
      const existing = await db.query(
        'SELECT id, extracted_json FROM Form_Data WHERE user_id = ? AND form_id = ?',
        [userId, formId]
      );
      
      let mergedData = { resume: 'resume.pdf' };
      if (existing.length > 0) {
        const previouslyExtracted = JSON.parse(existing[0].extracted_json);
        mergedData = { ...previouslyExtracted, resume: 'resume.pdf' };
        await db.query(
          'UPDATE Form_Data SET extracted_json = ? WHERE id = ?',
          [JSON.stringify(mergedData), existing[0].id]
        );
      } else {
        await db.query(
          'INSERT INTO Form_Data (user_id, form_id, extracted_json, status) VALUES (?, ?, ?, ?)',
          [userId, formId, JSON.stringify(mergedData), 'pending']
        );
      }
    }

    res.json({
      success: true,
      message: 'Resume PDF uploaded successfully.',
      resume: 'resume.pdf'
    });

  } catch (err) {
    console.error('Resume upload error:', err.message);
    res.status(500).json({ error: 'Failed to save PDF resume file. ' + err.message });
  }
});

// Save complete profile edits route
app.post('/api/profile/save', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const profileData = req.body; // { fullName, email, phone, ... }

  try {
    const formIds = [1, 2, 3];
    for (const formId of formIds) {
      const existing = await db.query(
        'SELECT id, extracted_json FROM Form_Data WHERE user_id = ? AND form_id = ?',
        [userId, formId]
      );
      
      let mergedData = { ...profileData };
      if (existing.length > 0) {
        const previouslyExtracted = JSON.parse(existing[0].extracted_json);
        mergedData = { ...previouslyExtracted, ...profileData };
        await db.query(
          'UPDATE Form_Data SET extracted_json = ? WHERE id = ?',
          [JSON.stringify(mergedData), existing[0].id]
        );
      } else {
        await db.query(
          'INSERT INTO Form_Data (user_id, form_id, extracted_json) VALUES (?, ?, ?)',
          [userId, formId, JSON.stringify(mergedData)]
        );
      }
    }
    
    // Update public/uploads/resume.pdf with the newly saved details
    const uploadsDir = path.join(__dirname, 'public', 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    const pdfPath = path.join(uploadsDir, 'resume.pdf');
    const writeStream = fs.createWriteStream(pdfPath);
    pdfGenerator.generateFormPDF(profileData, req.user.username, req.user.email, 'Resume Profile', writeStream);
    console.log('[Profile API] Updated compiled PDF resume.');

    profileData.resume = 'resume.pdf';

    console.log(`[Profile API] Successfully updated full profile for user session: ${userId}`);
    res.json({ success: true, message: 'Profile saved successfully.', profile: profileData });

  } catch (err) {
    console.error('Save profile error:', err.message);
    res.status(500).json({ error: 'Failed to save profile details.' });
  }
});

// Download any user's form submission (Admin only)
app.get('/api/admin/reports/pdf/:submissionId', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied. Administrator privileges required.' });
  }

  const { submissionId } = req.params;

  try {
    const dataRows = await db.query(
      `SELECT fd.extracted_json, f.form_name, u.username, u.email 
       FROM Form_Data fd 
       JOIN Forms f ON fd.form_id = f.id
       JOIN Users u ON fd.user_id = u.id
       WHERE fd.id = ?`,
      [submissionId]
    );

    if (dataRows.length === 0) {
      return res.status(404).send('<h1>No submission data found.</h1>');
    }

    const { extracted_json, form_name, username, email } = dataRows[0];
    const data = JSON.parse(extracted_json);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=form_report_${submissionId}.pdf`);

    pdfGenerator.generateFormPDF(data, username, email, form_name, res);

  } catch (error) {
    console.error('Admin PDF report error:', error.message);
    res.status(500).send('Server error generating report.');
  }
});


// -------------------------------------------------------------
// Admin Panel Dashboard Routes
// -------------------------------------------------------------

// Fetch Admin Statistics
app.get('/api/admin/stats', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied. Administrator privileges required.' });
  }

  try {
    // 1. Total count calculations
    const usersCount = await db.query('SELECT COUNT(*) AS count FROM Users');
    const formCount = await db.query('SELECT COUNT(*) AS count FROM Forms');
    const submissionsCount = await db.query('SELECT COUNT(*) AS count FROM Form_Data');
    const chatsCount = await db.query('SELECT COUNT(*) AS count FROM Chat_History');

    // 2. Fetch all registered users
    const allUsers = await db.query('SELECT id, username, email, role, created_at FROM Users ORDER BY created_at DESC');

    // 3. Fetch recent submissions list
    const submissions = await db.query(`
      SELECT fd.id, fd.status, fd.created_at, u.username, f.form_name, fd.extracted_json, fd.form_id
      FROM Form_Data fd
      JOIN Users u ON fd.user_id = u.id
      JOIN Forms f ON fd.form_id = f.id
      ORDER BY fd.created_at DESC LIMIT 15
    `);

    const parsedSubmissions = submissions.map(sub => ({
      ...sub,
      extracted_json: JSON.parse(sub.extracted_json)
    }));

    res.json({
      stats: {
        totalUsers: usersCount[0].count,
        totalForms: formCount[0].count,
        totalSubmissions: submissionsCount[0].count,
        totalMessages: chatsCount[0].count
      },
      users: allUsers,
      submissions: parsedSubmissions
    });

  } catch (error) {
    console.error('Admin stats error:', error.message);
    res.status(500).json({ error: 'Server error fetching admin statistics.' });
  }
});

// Public endpoint for browser extension to fetch a user's latest form data
app.get('/api/extension/data/:username', async (req, res) => {
  const { username } = req.params;
  try {
    const userRows = await db.query('SELECT id FROM Users WHERE username = ?', [username]);
    if (userRows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }
    const userId = userRows[0].id;
    
    // Get latest form data
    const dataRows = await db.query(
      'SELECT extracted_json FROM Form_Data WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
      [userId]
    );
    
    if (dataRows.length > 0) {
      res.json(JSON.parse(dataRows[0].extracted_json));
    } else {
      res.json({});
    }
  } catch (err) {
    console.error('Extension API error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// Handle HTML routing fallback (serves index.html for unknown files)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Initialize database and start Server
async function startServer() {
  // Boostrap Database tables
  await db.initializeDatabase();

  app.listen(PORT, () => {
    console.log(`================================================================`);
    console.log(` AI FORM FILLING CHATBOT SERVER RUNNING AT: http://localhost:${PORT}`);
    console.log(`================================================================`);
  });
}

startServer();
