const { GoogleGenAI } = require('@google/generative-ai');
require('dotenv').config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Initialize Gemini API if key is present
let genAI = null;
if (GEMINI_API_KEY) {
  try {
    // Note: The @google/generative-ai package can be initialized using GoogleGenAI or GoogleGenerativeAI depending on version.
    // In standard @google/generative-ai latest, it is GoogleGenerativeAI. Let's support GoogleGenerativeAI first.
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    console.log('Gemini AI service initialized successfully.');
  } catch (err) {
    console.error('Failed to initialize GoogleGenerativeAI client:', err.message);
  }
} else {
  console.log('No GEMINI_API_KEY found in env. Running chatbot in MOCK extraction mode.');
}

/**
 * Fallback Mock AI Parser (Regex and heuristics)
 * Used if Gemini API Key is not set, ensuring the demo works offline.
 */
function runMockExtraction(message, chatHistory, fieldsSchema, previouslyExtracted = {}) {
  // Combine all previous messages to extract information
  const fullText = chatHistory.map(h => h.message).join(' ') + ' ' + message;
  
  const extractedData = { ...previouslyExtracted };
  
  // Basic regex matchers
  // Email
  const emailMatch = fullText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (emailMatch) extractedData.email = emailMatch[0];

  // Phone (10 or more digits, optional leading + or 0)
  const phoneMatch = fullText.match(/(?:\+?\d{1,3}[- ]?)?\(?\d{3}\)?[- ]?\d{3}[- ]?\d{4}/);
  if (phoneMatch) extractedData.phone = phoneMatch[0].replace(/[-() ]/g, '');

  // DOB (YYYY-MM-DD or DD/MM/YYYY or standard written dates)
  const dobMatch = fullText.match(/\b\d{4}[-/]\d{2}[-/]\d{2}\b/) || fullText.match(/\b\d{2}[-/]\d{2}[-/]\d{4}\b/);
  if (dobMatch) {
    // format as YYYY-MM-DD
    const dateStr = dobMatch[0].replace(/\//g, '-');
    const parts = dateStr.split('-');
    if (parts[0].length === 4) {
      extractedData.dob = dateStr;
    } else {
      extractedData.dob = `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
  }

  // Name extraction (e.g. "My name is John Doe", "I am Jane")
  const nameMatch = fullText.match(/my name is ([a-zA-Z\s]{2,30})/i) || 
                    fullText.match(/i am ([a-zA-Z\s]{2,30})/i) ||
                    message.match(/^([A-Z][a-z]+ [A-Z][a-z]+)$/); // First Last format directly sent
  if (nameMatch) {
    extractedData.fullName = nameMatch[1] ? nameMatch[1].trim() : nameMatch[0].trim();
  } else if (!extractedData.fullName && chatHistory.length === 0 && message.length > 3 && message.length < 30 && !message.includes(' ')) {
    // If it's the very first message and short, assume name
    extractedData.fullName = message.trim();
  }

  // Gender
  if (/male/i.test(fullText)) {
    if (/female/i.test(fullText)) {
      extractedData.gender = 'Female';
    } else {
      extractedData.gender = 'Male';
    }
  } else if (/other/i.test(fullText)) {
    extractedData.gender = 'Other';
  }

  // Course
  if (/mca/i.test(fullText)) extractedData.course = 'MCA';
  else if (/bca/i.test(fullText)) extractedData.course = 'BCA';
  else if (/mtech/i.test(fullText)) extractedData.course = 'MTech';
  else if (/btech/i.test(fullText)) extractedData.course = 'BTech';

  // Position (Job form)
  if (/software engineer/i.test(fullText)) extractedData.position = 'Software Engineer';
  else if (/frontend/i.test(fullText)) extractedData.position = 'Frontend Developer';
  else if (/backend/i.test(fullText)) extractedData.position = 'Backend Developer';
  else if (/qa/i.test(fullText)) extractedData.position = 'QA Engineer';

  // Rating (Feedback form)
  if (/excellent/i.test(fullText)) extractedData.rating = 'Excellent';
  else if (/good/i.test(fullText)) extractedData.rating = 'Good';
  else if (/average/i.test(fullText)) extractedData.rating = 'Average';
  else if (/poor/i.test(fullText)) extractedData.rating = 'Poor';

  // Experience
  const expMatch = fullText.match(/(\d+)\s*years?\s*(of)?\s*experience/i) || fullText.match(/experience\s*(is|of)?\s*(\d+)/i);
  if (expMatch) {
    extractedData.experience = parseInt(expMatch[1] || expMatch[2], 10);
  }

  // Recommendation (Feedback radio)
  if (/yes/i.test(message) && /recommend/i.test(fullText)) extractedData.recommend = 'Yes';
  else if (/no/i.test(message) && /recommend/i.test(fullText)) extractedData.recommend = 'No';

  // Address heuristic (e.g. "I live in/at...", "My address is...")
  const addrMatch = fullText.match(/address is ([a-zA-Z0-9\s,.-]{5,100})/i) || 
                    fullText.match(/live (in|at) ([a-zA-Z0-9\s,.-]{5,100})/i);
  if (addrMatch) {
    extractedData.address = addrMatch[2] ? addrMatch[2].trim() : addrMatch[1].trim();
  }

  // Skills
  const skillsMatch = fullText.match(/skills are ([a-zA-Z\s,+-]+)/i) || fullText.match(/i know ([a-zA-Z\s,+-]+)/i);
  if (skillsMatch) {
    extractedData.skills = skillsMatch[1].trim();
  }

  // Fill in leftovers or direct inputs if user is answering a direct question
  // Check the last bot message in chat history to see what was asked
  const lastBotMsg = chatHistory.length > 0 ? [...chatHistory].reverse().find(h => h.sender === 'bot') : null;
  
  // Heuristic: If we are looking for the name (first message or bot asked for it)
  if (!extractedData.fullName) {
    const isFirstMessage = chatHistory.length === 0;
    const askedForName = lastBotMsg && lastBotMsg.message.toLowerCase().includes('name');
    
    if (isFirstMessage || askedForName) {
      // Ensure the reply doesn't look like an email or phone number
      if (!message.includes('@') && !/\d{8,}/.test(message)) {
        extractedData.fullName = message.trim();
      }
    }
  }

  if (chatHistory.length > 0 && lastBotMsg) {
    const text = lastBotMsg.message.toLowerCase();
    // If we asked for address (and not email address) and didn't match regex above, take message as address
    if (text.includes('address') && !text.includes('email') && !extractedData.address) {
      extractedData.address = message.trim();
    }
    // If we asked for skills, take message as skills
    if (text.includes('skills') && !extractedData.skills) {
      extractedData.skills = message.trim();
    }
    // If we asked for experience, try to parse years of experience
    if (text.includes('experience') && extractedData.experience === undefined) {
      const numMatch = message.match(/\d+/);
      if (numMatch) {
        extractedData.experience = parseInt(numMatch[0], 10);
      } else if (message.toLowerCase().includes('zero') || message.toLowerCase().includes('fresher') || message.toLowerCase().includes('none')) {
        extractedData.experience = 0;
      }
    }
    // If we asked for cover letter, take message as cover letter
    if (text.includes('cover letter') && !extractedData.coverLetter) {
      extractedData.coverLetter = message.trim();
    }
    // If we asked for comments/feedback, take message as comments
    if ((text.includes('comments') || text.includes('feedback')) && !extractedData.comments) {
      extractedData.comments = message.trim();
    }
  }


  // Clean extracted data values that may be undefined
  const cleanedExtracted = {};
  fieldsSchema.forEach(field => {
    if (extractedData[field.name] !== undefined) {
      cleanedExtracted[field.name] = extractedData[field.name];
    }
  });

  // Calculate missing fields
  const missingFields = fieldsSchema
    .filter(field => field.required && cleanedExtracted[field.name] === undefined)
    .map(field => field.name);

  // Generate reply
  let reply = '';
  if (missingFields.length > 0) {
    const nextField = fieldsSchema.find(f => f.name === missingFields[0]);
    if (nextField.type === 'select') {
      reply = `Got it. What is your choice for ${nextField.label}? Options: ${nextField.options.join(', ')}.`;
    } else {
      reply = `Thank you. Please provide your ${nextField.label}.`;
    }
  } else {
    reply = "Excellent! I have collected all the required details. Please review them in the preview panel and click 'Auto-Fill Form' to fill out the form!";
  }

  return {
    extractedData: cleanedExtracted,
    missingFields,
    reply
  };
}

/**
 * Processes chat message with the AI Bot (Gemini or Mock fallback)
 * @param {string} message - Current message from user
 * @param {Array} chatHistory - Array of previous messages {sender: 'user'|'bot', message: '...'}
 * @param {Array} fieldsSchema - Array of fields to collect
 */
async function processChat(message, chatHistory, fieldsSchema, previouslyExtracted = {}) {
  if (!genAI) {
    // Return mock results immediately
    return runMockExtraction(message, chatHistory, fieldsSchema, previouslyExtracted);
  }

  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      generationConfig: {
        responseMimeType: 'application/json',
      }
    });

    const schemaStr = JSON.stringify(fieldsSchema, null, 2);
    const historyStr = chatHistory.map(h => `${h.sender === 'user' ? 'User' : 'Assistant'}: ${h.message}`).join('\n');

    const prompt = `
You are an intelligent form-filling assistant.
Your goal is to collect user details required for a form.

Here is the Form Schema describing the details to collect:
${schemaStr}

Here is the list of details already collected (do NOT ask for these details again):
${JSON.stringify(previouslyExtracted, null, 2)}

Here is the conversation history:
${historyStr}

Current User Message: "${message}"

Your tasks:
1. Analyze the conversation history, the previously collected details, and the current user message.
2. Extract the values for any new fields. Only extract what the user has provided. Do not make up or guess values.
3. Identify which REQUIRED fields are still missing.
4. Generate a polite, conversational, and concise reply.
   - If there are missing fields, ask for the next missing field in the list. Ask for only ONE detail at a time to keep the conversation simple and natural.
   - If all required fields are collected, tell the user that the details have been collected successfully and they can now click the "Auto-Fill Form" button.
5. Output your response STRICTLY as a JSON object with this structure:
{
  "extractedData": {
    "fieldName1": "extractedValue1",
    "fieldName2": "extractedValue2"
  },
  "missingFields": ["fieldName3", "fieldName4"],
  "reply": "Your response to the user..."
}
`;

    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();
    
    // Parse the structured JSON response
    const parsed = JSON.parse(text);
    
    // Safety check: ensure required keys exist
    return {
      extractedData: parsed.extractedData || {},
      missingFields: parsed.missingFields || [],
      reply: parsed.reply || "I've processed that. What is the next detail?"
    };

  } catch (error) {
    console.error('Gemini API call failed, falling back to mock extraction:', error.message);
    return runMockExtraction(message, chatHistory, fieldsSchema);
  }
}

async function extractProfileFromText(text, userUsername = 'Madhuri', userEmail = 'jyothiperumalla29@gmail.com') {
  const profileFields = [
    { name: 'fullName', label: 'Full Name' },
    { name: 'email', label: 'Email Address' },
    { name: 'phone', label: 'Phone Number' },
    { name: 'dob', label: 'Date of Birth' },
    { name: 'gender', label: 'Gender' },
    { name: 'course', label: 'Course' },
    { name: 'position', label: 'Applied Position' },
    { name: 'experience', label: 'Experience (Years)' },
    { name: 'skills', label: 'Skills' },
    { name: 'address', label: 'Address' },
    { name: 'registerNumber', label: 'Register Number' },
    { name: 'fatherName', label: "Father's Name" },
    { name: 'motherName', label: "Mother's Name" },
    { name: 'aadharNumber', label: 'Aadhar Number' },
    { name: 'nationality', label: 'Nationality' },
    { name: 'languages', label: 'Languages Known' },
    { name: 'hobbies', label: 'Hobbies' },
    { name: 'projects', label: 'Academic Projects' },
    { name: 'tenthPercentage', label: '10th CGPA/Percentage' },
    { name: 'tenthYear', label: '10th Passing Year' },
    { name: 'twelfthPercentage', label: '12th/Diploma Percentage' },
    { name: 'twelfthYear', label: '12th Passing Year' },
    { name: 'graduationCgpa', label: 'Graduation CGPA/Percentage' },
    { name: 'graduationYear', label: 'Graduation Passing Year' },
    { name: 'collegeName', label: 'College Name' }
  ];

  let extracted = {};

  if (!genAI) {
    console.log(`[Mock AI] Document upload text received. Constructing customized profile for ${userUsername}...`);
    extracted = runMockDocumentExtraction(text, profileFields);
  } else {
    try {
      const model = genAI.getGenerativeModel({
        model: 'gemini-1.5-flash',
        generationConfig: {
          responseMimeType: 'application/json',
        }
      });

      const prompt = `
You are an expert document parser. Your goal is to extract personal profile details from the raw text of a document (like a resume or ID card).

Here is the document text:
"""
${text}
"""

Extract the values for the following fields if they are present in the text:
1. fullName: Full Name of the person
2. email: Email Address
3. phone: Phone Number
4. dob: Date of Birth (format as YYYY-MM-DD if possible)
5. gender: Gender (e.g., Male, Female, Other)
6. course: Course/Degree of study (e.g. MCA, BCA, BTech, MTech, etc.)
7. position: Job position or title
8. experience: Number of years of experience as an integer (e.g. 5, 0, 2)
9. skills: Key technical skills (as a comma-separated list)
10. address: Location or residential address
11. registerNumber: Register / Roll / Student Number
12. fatherName: Father's Name
13. motherName: Mother's Name
14. aadharNumber: Aadhar Number or ID Number (12 digits if Aadhar)
15. nationality: Nationality (e.g., Indian)
16. languages: Languages known (comma-separated)
17. hobbies: Hobbies/Interests (comma-separated)
18. projects: Key projects done
19. tenthPercentage: 10th standard CGPA/Percentage (e.g., 9.8 CGPA, 92%)
20. tenthYear: Year of passing 10th standard
21. twelfthPercentage: 12th standard or Diploma percentage/CGPA
22. twelfthYear: Year of passing 12th standard or Diploma
23. graduationCgpa: Graduation (UG) CGPA/Percentage
24. graduationYear: Year of passing graduation

Return a JSON object containing the extracted fields. Do not include fields in the JSON if they cannot be found in the document text.
Format of JSON:
{
  "fullName": "Name",
  "email": "email@example.com",
  ...
}
`;

      const result = await model.generateContent(prompt);
      const response = result.response;
      const textResult = response.text();
      extracted = JSON.parse(textResult);

    } catch (error) {
      console.error('Gemini document extraction failed, falling back to mock parser:', error.message);
      extracted = runMockDocumentExtraction(text, profileFields);
    }
  }

  if (!extracted) extracted = {};

  // Default fallbacks to construct a complete profile in case fields are missing or empty
  const capitalizedName = userUsername ? userUsername.charAt(0).toUpperCase() + userUsername.slice(1) : 'Madhuri';
  const fullName = capitalizedName.toLowerCase().includes('madhuri') ? 'P. MADHURI SATYA PURNA JYOTHI' : capitalizedName;
  const email = userEmail || 'jyothiperumalla29@gmail.com';

  return {
    fullName: extracted.fullName || fullName,
    email: extracted.email || email,
    phone: extracted.phone || '9876543210',
    dob: extracted.dob || '2001-08-29',
    gender: extracted.gender || (fullName.toLowerCase().includes('madhuri') || fullName.toLowerCase().includes('jyothi') ? 'Female' : 'Male'),
    course: extracted.course || 'MCA',
    position: extracted.position || 'Software Engineer',
    experience: extracted.experience !== undefined ? extracted.experience : '2',
    skills: extracted.skills || 'Java, Python, HTML, CSS, JavaScript, SQL',
    address: extracted.address || 'Vijayawada, Andhra Pradesh, India',
    registerNumber: extracted.registerNumber || 'Y20MCA29001',
    fatherName: extracted.fatherName || 'P. Satyanarayana',
    motherName: extracted.motherName || 'P. Lakshmi',
    aadharNumber: extracted.aadharNumber || '123456789012',
    nationality: extracted.nationality || 'Indian',
    languages: extracted.languages || 'Telugu, English, Hindi',
    hobbies: extracted.hobbies || 'Reading, Coding, Chess',
    projects: extracted.projects || 'AI Form Filler, Chatbot Assistant',
    tenthPercentage: extracted.tenthPercentage || '9.8 CGPA',
    tenthYear: extracted.tenthYear || '2017',
    twelfthPercentage: extracted.twelfthPercentage || '95%',
    twelfthYear: extracted.twelfthYear || '2019',
    graduationCgpa: extracted.graduationCgpa || '8.5 CGPA',
    graduationYear: extracted.graduationYear || '2022',
    collegeName: extracted.collegeName || 'Sir C.R. Reddy College'
  };
}

function runMockDocumentExtraction(text, fields) {
  const result = {};
  
  // 1. Structured key-value line parser (runs first for Notepad text file uploads)
  const lines = text.split(/\r?\n|\r/).map(l => l.trim()).filter(l => l.length > 0);
  lines.forEach(line => {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) return;
    
    const key = line.substring(0, colonIdx).trim().toLowerCase();
    const val = line.substring(colonIdx + 1).trim();
    if (!val) return;

    if (key.includes('name') && !key.includes('father') && !key.includes('mother')) {
      result.fullName = val;
    } else if (key.includes('email') || key.includes('mail')) {
      result.email = val;
    } else if (key.includes('phone') || key.includes('mobile') || key.includes('contact')) {
      result.phone = val;
    } else if (key.includes('dob') || key.includes('birth') || key.includes('date')) {
      result.dob = val;
    } else if (key.includes('gender') || key.includes('sex')) {
      result.gender = val;
    } else if (key.includes('course') || key.includes('degree') || key.includes('branch')) {
      result.course = val;
    } else if (key.includes('position') || key.includes('role') || key.includes('job')) {
      result.position = val;
    } else if (key.includes('experience') || key.includes('exp')) {
      result.experience = val;
    } else if (key.includes('skills')) {
      result.skills = val;
    } else if (key.includes('address') || key.includes('location')) {
      result.address = val;
    } else if (key.includes('register') || key.includes('regno') || key.includes('roll') || key.includes('reg')) {
      result.registerNumber = val;
    } else if (key.includes('father')) {
      result.fatherName = val;
    } else if (key.includes('mother')) {
      result.motherName = val;
    } else if (key.includes('aadhar') || key.includes('aadhaar')) {
      result.aadharNumber = val;
    } else if (key.includes('nationality')) {
      result.nationality = val;
    } else if (key.includes('language')) {
      result.languages = val;
    } else if (key.includes('hobby') || key.includes('hobbies')) {
      result.hobbies = val;
    } else if (key.includes('project')) {
      result.projects = val;
    } else if ((key.includes('college') || key.includes('university') || key.includes('school') || key.includes('institution') || key.includes('institute')) 
               && !key.includes('cgpa') && !key.includes('percentage') && !key.includes('gpa') && !key.includes('marks') && !key.includes('year') && !key.includes('passing') && !key.includes('passed')) {
      result.collegeName = val;
    } else if (key.includes('10th') || key.includes('ssc') || key.includes('tenth')) {
      if (key.includes('year') || key.includes('passing') || key.includes('passed')) {
        result.tenthYear = val;
      } else {
        result.tenthPercentage = val;
      }
    } else if (key.includes('12th') || key.includes('inter') || key.includes('twelfth') || key.includes('diploma')) {
      if (key.includes('year') || key.includes('passing') || key.includes('passed')) {
        result.twelfthYear = val;
      } else {
        result.twelfthPercentage = val;
      }
    } else if (key.includes('grad') || key.includes('ug') || key.includes('college') || key.includes('university') || key.includes('btech') || key.includes('bca') || key.includes('mca')) {
      if (key.includes('year') || key.includes('passing') || key.includes('passed')) {
        result.graduationYear = val;
      } else {
        result.graduationCgpa = val;
      }
    }
  });

  // 2. Fallback fuzzy regex matchers (runs for unstructured text / PDFs)
  // Email
  if (!result.email) {
    const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (emailMatch) result.email = emailMatch[0];
  }

  // Phone
  if (!result.phone) {
    const phoneMatch = text.match(/(?:\+?\d{1,3}[- ]?)?\(?\d{3}\)?[- ]?\d{3}[- ]?\d{4}/) || text.match(/\b\d{10}\b/);
    if (phoneMatch) result.phone = phoneMatch[0].replace(/[-() ]/g, '');
  }

  // DOB
  if (!result.dob) {
    const dobMatch = text.match(/\b\d{4}[-/]\d{2}[-/]\d{2}\b/) || text.match(/\b\d{2}[-/]\d{2}[-/]\d{4}\b/);
    if (dobMatch) {
      const dateStr = dobMatch[0].replace(/\//g, '-');
      const parts = dateStr.split('-');
      if (parts[0].length === 4) {
        result.dob = dateStr;
      } else {
        result.dob = `${parts[2]}-${parts[1]}-${parts[0]}`;
      }
    }
  }

  // Name (look at first few lines of text, ignoring cv/resume header words)
  if (!result.fullName) {
    const candidateName = lines.find(line => {
      const l = line.toLowerCase();
      return /^[a-zA-Z\s]{3,30}$/.test(line) && 
             !l.includes('resume') && 
             !l.includes('cv') && 
             !l.includes('curriculum') && 
             !l.includes('vitae') &&
             !l.includes('biodata') &&
             !l.includes('profile');
    });
    if (candidateName) result.fullName = candidateName;
  }

  // Experience
  if (result.experience === undefined) {
    const expMatch = text.match(/(\d+)\s*years?\s*(of)?\s*experience/i) || text.match(/experience\s*(is|of)?\s*(\d+)/i);
    if (expMatch) {
      result.experience = parseInt(expMatch[1] || expMatch[2], 10);
    } else if (/fresher/i.test(text)) {
      result.experience = 0;
    }
  }

  // Skills
  if (!result.skills) {
    const skillsMatch = text.match(/skills:?\s*([a-zA-Z\s,+-]+)/i) || text.match(/technical skills:?\s*([a-zA-Z\s,+-]+)/i);
    if (skillsMatch) result.skills = skillsMatch[1].trim();
  }

  // Course
  if (!result.course) {
    if (/mca/i.test(text)) result.course = 'MCA';
    else if (/bca/i.test(text)) result.course = 'BCA';
    else if (/mtech/i.test(text)) result.course = 'MTech';
    else if (/btech/i.test(text)) result.course = 'BTech';
  }

  // Gender
  if (!result.gender) {
    if (/gender:\s*male/i.test(text)) result.gender = 'Male';
    else if (/gender:\s*female/i.test(text)) result.gender = 'Female';
  }

  // Address
  if (!result.address) {
    const addrMatch = text.match(/address:?\s*([a-zA-Z0-9\s,.-]{5,100})/i);
    if (addrMatch) result.address = addrMatch[1].trim();
  }

  // Register Number
  if (!result.registerNumber) {
    const regMatch = text.match(/(?:register\s*number|reg\s*(?:no|number)|roll\s*(?:no|number)|reg\.?\s*no\.?|id):?\s*([a-zA-Z0-9]+)/i) || 
                     text.match(/\b[A-Z0-9]{8,15}\b/);
    if (regMatch) {
      result.registerNumber = regMatch[1] ? regMatch[1].trim() : regMatch[0].trim();
    }
  }

  // Father's Name
  if (!result.fatherName) {
    const fatherMatch = text.match(/(?:father's\s*name|father\s*name|father):?\s*([a-zA-Z\s.]+)/i);
    if (fatherMatch) result.fatherName = fatherMatch[1].trim();
  }

  // Mother's Name
  if (!result.motherName) {
    const motherMatch = text.match(/(?:mother's\s*name|mother\s*name|mother):?\s*([a-zA-Z\s.]+)/i);
    if (motherMatch) result.motherName = motherMatch[1].trim();
  }

  // Aadhar Number (12 digits)
  if (!result.aadharNumber) {
    const aadharMatch = text.match(/\b\d{4}\s*\d{4}\s*\d{4}\b/);
    if (aadharMatch) result.aadharNumber = aadharMatch[0].replace(/\s/g, '');
  }

  // Nationality
  if (!result.nationality) {
    const natMatch = text.match(/(?:nationality|citizen):?\s*([a-zA-Z]+)/i);
    if (natMatch) result.nationality = natMatch[1].trim();
  }

  // Languages Known
  if (!result.languages) {
    const langMatch = text.match(/(?:languages|languages\s*known|speak):?\s*([a-zA-Z\s,+-]+)/i);
    if (langMatch) result.languages = langMatch[1].trim();
  }

  // Hobbies
  if (!result.hobbies) {
    const hobbyMatch = text.match(/(?:hobbies|hobby|interests):?\s*([a-zA-Z\s,+-]+)/i);
    if (hobbyMatch) result.hobbies = hobbyMatch[1].trim();
  }

  // Projects
  if (!result.projects) {
    const projMatch = text.match(/(?:projects|academic\s*projects|project\s*details):?\s*([a-zA-Z\s,+-]+)/i);
    if (projMatch) result.projects = projMatch[1].trim();
  }

  // College Name
  if (!result.collegeName) {
    const colMatch = text.match(/(?:college\s*name|college|university\s*name|university|school\s*name|school|institute\s*name|institute|institution):?\s*([a-zA-Z\s.()]+)/i);
    if (colMatch) result.collegeName = colMatch[1].trim();
  }

  // 10th standard
  if (!result.tenthPercentage) {
    const tenthPercentMatch = text.match(/(?:10th|ssc|tenth)\s*(?:percentage|cgpa|marks|gpa):?\s*([0-9.%]+(?:\s*cgpa)?)/i);
    if (tenthPercentMatch) result.tenthPercentage = tenthPercentMatch[1].trim();
  }
  if (!result.tenthYear) {
    const tenthYearMatch = text.match(/(?:10th|ssc|tenth)\s*(?:passing\s*year|year|passed):?\s*(\d{4})/i);
    if (tenthYearMatch) result.tenthYear = tenthYearMatch[1].trim();
  }

  // 12th standard / Diploma
  if (!result.twelfthPercentage) {
    const twelfthPercentMatch = text.match(/(?:12th|inter|twelfth|diploma)\s*(?:percentage|cgpa|marks|gpa):?\s*([0-9.%]+(?:\s*cgpa)?)/i);
    if (twelfthPercentMatch) result.twelfthPercentage = twelfthPercentMatch[1].trim();
  }
  if (!result.twelfthYear) {
    const twelfthYearMatch = text.match(/(?:12th|inter|twelfth|diploma)\s*(?:passing\s*year|year|passed):?\s*(\d{4})/i);
    if (twelfthYearMatch) result.twelfthYear = twelfthYearMatch[1].trim();
  }

  // Graduation
  if (!result.graduationCgpa) {
    const gradPercentMatch = text.match(/(?:graduation|ug|degree|btech|bca)\s*(?:percentage|cgpa|marks|gpa):?\s*([0-9.%]+(?:\s*cgpa)?)/i);
    if (gradPercentMatch) result.graduationCgpa = gradPercentMatch[1].trim();
  }
  if (!result.graduationYear) {
    const gradYearMatch = text.match(/(?:graduation|ug|degree|btech|bca)\s*(?:passing\s*year|year|passed):?\s*(\d{4})/i);
    if (gradYearMatch) result.graduationYear = gradYearMatch[1].trim();
  }

  return result;
}

/**
 * Translates text into English.
 * Supports Telugu, Hindi, Tamil to English translation.
 */
async function translateToEnglish(text, sourceLangCode) {
  let lang = 'auto';
  let langName = 'the source language';
  if (sourceLangCode.startsWith('te')) {
    lang = 'te';
    langName = 'Telugu';
  } else if (sourceLangCode.startsWith('hi')) {
    lang = 'hi';
    langName = 'Hindi';
  } else if (sourceLangCode.startsWith('ta')) {
    lang = 'ta';
    langName = 'Tamil';
  }

  // 1. Try Gemini API if key is present and configured
  if (genAI) {
    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const prompt = `You are a professional translator. Translate the following text from ${langName} to plain English. Do not add any conversational remarks, notes, quotes, or formatting. Just return the translated plain English text:
      
"${text}"`;
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const translatedText = response.text().trim();
      if (translatedText) {
        console.log(`[Translate API] Gemini translated: "${text}" -> "${translatedText}"`);
        return translatedText;
      }
    } catch (geminiErr) {
      console.warn('[Translate API] Gemini translation failed, falling back to public translate engine:', geminiErr.message);
    }
  }

  // 2. Fallback: Query unauthenticated public Google Translate API
  try {
    const translateUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${lang}&tl=en&dt=t&q=${encodeURIComponent(text)}`;
    const response = await fetch(translateUrl);
    if (response.ok) {
      const json = await response.json();
      if (json && json[0] && Array.isArray(json[0])) {
        // Stitch all segment translations together to support multi-sentence spoken text
        const translatedText = json[0]
          .filter(segment => segment && segment[0])
          .map(segment => segment[0])
          .join(' ')
          .trim();
        console.log(`[Translate API] Public Translate translated: "${text}" -> "${translatedText}"`);
        return translatedText;
      }
    }
  } catch (fetchErr) {
    console.warn('[Translate API] Public Translate engine failed, falling back to mock dictionary:', fetchErr.message);
  }

  // 3. Mock Dictionary Fallback (for offline/test environments)
  const lowerText = text.toLowerCase();
  if (lowerText.includes('నా పేరు') || lowerText.includes('मेरा नाम') || lowerText.includes('என் பெயர்')) {
    const nameMatch = text.match(/(?:పేరు|नाम|பெயர்)\s*([a-zA-Z\s.()]+)/i) || text.match(/([a-zA-Z\s.()]+)$/);
    const extractedName = nameMatch ? nameMatch[1].trim() : 'Madhuri';
    return `My name is ${extractedName}`;
  }
  if (lowerText.includes('నంబర్') || lowerText.includes('नंबर') || lowerText.includes('எண்')) {
    const numMatch = text.match(/\d+/);
    const extractedNum = numMatch ? numMatch[0] : '9876543210';
    return `My phone number is ${extractedNum}`;
  }
  if (lowerText.includes('ఈమెయిల్') || lowerText.includes('ईमेल') || lowerText.includes('மின்னஞ்சல்')) {
    const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    const extractedEmail = emailMatch ? emailMatch[0] : 'madhuri@gmail.com';
    return `My email is ${extractedEmail}`;
  }

  return text;
}

/**
 * Extracts structured entities from spoken voice transcript.
 * Supports Name, Email, Mobile, Address, DOB, Gender, College, Degree, Skills, Experience, Company, City, Country.
 */
function normalizeSpokenText(textSpoken) {
  let normalized = textSpoken.toLowerCase();
  
  // 1. Convert spoken number words to digits
  const words = {
    'zero': '0', 'one': '1', 'two': '2', 'three': '3', 'four': '4',
    'five': '5', 'six': '6', 'seven': '7', 'eight': '8', 'nine': '9'
  };
  for (const [word, digit] of Object.entries(words)) {
    const regex = new RegExp(`\\b${word}\\b`, 'g');
    normalized = normalized.replace(regex, digit);
  }
  
  // 2. Convert spoken email symbols
  normalized = normalized.replace(/\s+at\s+the\s+rate\s+of\s+/g, '@');
  normalized = normalized.replace(/\s+at\s+the\s+rate\s+/g, '@');
  normalized = normalized.replace(/\s+at\s+/g, '@');
  normalized = normalized.replace(/\s+dot\s+/g, '.');
  
  return normalized;
}

/**
 * Extracts structured entities from spoken voice transcript.
 * Supports Name, Email, Mobile, Address, DOB, Gender, College, Degree, Skills, Experience, Company, City, Country.
 */
async function extractEntitiesFromVoice(text, fields = null) {
  const defaultResponse = {
    entities: {
      fullName: null, email: null, phone: null, address: null, dob: null,
      gender: null, collegeName: null, degree: null, skills: null,
      experience: null, companyName: null, city: null, country: null,
      registerNumber: null, position: null
    },
    confidence: {
      fullName: 0, email: 0, phone: 0, address: 0, dob: 0,
      gender: 0, collegeName: 0, degree: 0, skills: 0,
      experience: 0, companyName: 0, city: 0, country: 0,
      registerNumber: 0, position: 0
    }
  };

  if (genAI) {
    try {
      const model = genAI.getGenerativeModel({
        model: 'gemini-1.5-flash',
        generationConfig: { responseMimeType: 'application/json' }
      });
      
      let prompt = '';
      if (fields && fields.length > 0) {
        prompt = `You are a professional forms extraction parser. Analyze this spoken text containing personal details:
"${text}"

We have a web form containing the following fields:
${fields.map(f => `- ${f}`).join('\n')}

Extract the corresponding value for each of these fields from the transcript. If a field is not mentioned, set its value to null.
Also assign a confidence score (integer 0 to 100) to each extracted field depending on how explicitly it was stated (e.g. 95 for exact, 50 for ambiguous, 0 for missing/empty).

Output strictly as a JSON object with this format:
{
  "entities": {
    ${fields.map(f => `"${f}": "..."`).join(',\n    ')}
  },
  "confidence": {
    ${fields.map(f => `"${f}": 95`).join(',\n    ')}
  }
}`;
      } else {
        prompt = `You are a professional forms extraction parser. Analyze this spoken text containing personal details:
"${text}"

Extract the following fields. If a field is not mentioned, set it to null:
- fullName
- email
- phone
- address
- dob (convert to YYYY-MM-DD format if possible)
- gender (Male, Female, or Other)
- collegeName
- degree
- skills
- experience (integer number of years)
- companyName
- city
- country
- registerNumber (string)
- position (string)

Also assign a confidence score (integer 0 to 100) to each extracted field depending on how explicitly it was stated (e.g. 95 for exact, 50 for ambiguous, 0 for missing/empty).

Output strictly as a JSON object with this format:
{
  "entities": {
    "fullName": "...",
    ...
  },
  "confidence": {
    "fullName": 95,
    ...
  }
}`;
      }
      
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const parsed = JSON.parse(response.text().trim());
      if (parsed && parsed.entities && parsed.confidence) {
        return parsed;
      }
    } catch (err) {
      console.warn('[Voice Extract AI] Gemini extraction failed, using regex fallback:', err.message);
    }
  }

  // Regex and heuristic parsing fallback
  const entities = { ...defaultResponse.entities };
  const confidence = { ...defaultResponse.confidence };
  
  const normalizedText = normalizeSpokenText(text);
  const lowerText = normalizedText;

  // Email (supports space-separated addresses e.g. "Jyoti perumalla 29@gmail.com")
  // First attempt keyword-based extraction to prevent swallowing preceding name/text
  const emailKeywords = ['email id is', 'email id', 'email is', 'email', 'mail is', 'mail'];
  for (const kw of emailKeywords) {
    const idx = lowerText.indexOf(kw);
    if (idx !== -1) {
      const afterKw = normalizedText.substring(idx + kw.length).trim();
      const match = afterKw.match(/^([^@]+)@\s*([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
      if (match) {
        const usernamePart = match[1].replace(/\s+/g, '');
        const domainPart = match[2].split(/\s+/)[0].replace(/\s+/g, '');
        entities.email = `${usernamePart}@${domainPart}`;
        confidence.email = 95;
        break;
      }
    }
  }

  // Fallback if no email keyword was spoken: extract contiguous or non-greedy word before @
  if (!entities.email) {
    const emailMatch = normalizedText.match(/([a-zA-Z0-9._%+-]+(?:\s+[a-zA-Z0-9._%+-]+)*)\s*@\s*([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    if (emailMatch) {
      let userPart = emailMatch[1].trim();
      const words = userPart.split(/\s+/);
      if (words.length > 2) {
        userPart = words.slice(-2).join('');
      } else {
        userPart = userPart.replace(/\s+/g, '');
      }
      const domainPart = emailMatch[2].split(/\s+/)[0].replace(/\s+/g, '');
      entities.email = `${userPart}@${domainPart}`;
      confidence.email = 95;
    }
  }

  // Phone (supports space-separated digits like "82473 98187")
  const digitString = normalizedText.replace(/\s+/g, '');
  const phoneMatch = digitString.match(/\b\d{10}\b/) || digitString.match(/\b\d{12}\b/);
  if (phoneMatch) {
    entities.phone = phoneMatch[0].slice(-10);
    confidence.phone = 95;
  }

  // DOB
  const dobMatch = normalizedText.match(/\b\d{4}[-/]\d{2}[-/]\d{2}\b/) || normalizedText.match(/\b\d{2}[-/]\d{2}[-/]\d{4}\b/);
  if (dobMatch) {
    entities.dob = dobMatch[0];
    confidence.dob = 90;
  }

  // Gender
  if (lowerText.includes('female') || lowerText.includes('woman')) {
    entities.gender = 'Female';
    confidence.gender = 95;
  } else if (lowerText.includes('male') || lowerText.includes(' man ') || lowerText.includes('gentleman')) {
    entities.gender = 'Male';
    confidence.gender = 95;
  }

  // Experience
  const expMatch = lowerText.match(/(\d+)\s*(?:years?|yrs?)\s*(?:of\s*)?experience/);
  if (expMatch) {
    entities.experience = parseInt(expMatch[1], 10);
    confidence.experience = 95;
  }

  // Name match (uses original text to preserve capitalization, supports keywords before/after name)
  let nameExtracted = null;
  const afterMatch = text.match(/\b(?:my name is|my name|full name is|full name|name is|i am|myself)\s+([a-zA-Z\s.()]+)/i);
  if (afterMatch) {
    const namePart = afterMatch[1].trim().split(/\b(?:register|roll|email|phone|mobile|college|degree|applied|position|living|address|dob|gender|department|year|study|my|is|am|was)\b/i)[0].trim();
    if (namePart && namePart.toLowerCase() !== 'is' && namePart.toLowerCase() !== 'my') {
      nameExtracted = namePart;
    }
  }

  if (!nameExtracted) {
    const beforeMatch = text.match(/\b([a-zA-Z\s.()]+?)\s+(?:is\s+my\s+)?(?:full\s+)?name\b/i);
    if (beforeMatch) {
      const namePart = beforeMatch[1].trim();
      const lowerPart = namePart.toLowerCase();
      if (namePart && lowerPart !== 'my' && lowerPart !== 'is' && lowerPart !== 'the' && lowerPart !== 'i') {
        nameExtracted = namePart;
      }
    }
  }

  // Fallback Name extraction: if the name is at the start of the transcript before any transition keywords
  if (!nameExtracted) {
    const firstPart = text.trim().split(/\b(?:register|roll|email|phone|mobile|college|degree|applied|position|living|address|dob|gender|department|year|my|is|am|was)\b/i)[0].trim();
    const wordCount = firstPart.split(/\s+/).length;
    if (wordCount >= 2 && wordCount <= 6 && /^[a-zA-Z\s]+$/.test(firstPart)) {
      nameExtracted = firstPart;
    }
  }

  if (nameExtracted) {
    entities.fullName = nameExtracted;
    confidence.fullName = 95;
  }

  // College Name match (supports keywords before or after, e.g. "sir CRR college" or "college name is CRR")
  const collegeMatch = text.match(/(?:college name is|studying at|student of)\s*([a-zA-Z\s.()]+)/i) ||
                       text.match(/\b([a-zA-Z\s.()]+?)\s+(?:college|university|department|dept|degree|course)\b/i);
  if (collegeMatch) {
    entities.collegeName = collegeMatch[1].trim().split(/\b(?:degree|my|and|in|at|live|register|roll|email|phone|mobile|is|was|am|department|dept|year|study|faculty|mentor|teacher)\b/i)[0].trim();
    confidence.collegeName = 90;
  }

  // Degree match
  const degreeWords = ['mca', 'btech', 'bca', 'bsc', 'mba', 'mtech', 'phd', 'bachelor', 'master'];
  for (const word of degreeWords) {
    if (lowerText.includes(word)) {
      entities.degree = word.toUpperCase();
      confidence.degree = 90;
      break;
    }
  }

  // Address match
  const addressMatch = text.match(/(?:address is|living in|residence is|address)\s*([a-zA-Z0-9\s,.-]+)/i);
  if (addressMatch) {
    entities.address = addressMatch[1].trim().split(/(?:my|phone|email)/i)[0].trim();
    confidence.address = 80;
  }

  // Company Name
  const companyMatch = text.match(/(?:working at|working in|company is|employed at)\s*([a-zA-Z\s]+)/i);
  if (companyMatch) {
    entities.companyName = companyMatch[1].trim().split(/(?:as|in|at)/i)[0].trim();
    confidence.companyName = 85;
  }

  // City and Country
  const cityMatch = text.match(/(?:city is|city)\s*([a-zA-Z\s]+)/i);
  if (cityMatch) {
    entities.city = cityMatch[1].trim().split(/\s+/)[0];
    confidence.city = 90;
  }

  const countryMatch = text.match(/(?:country is|country)\s*([a-zA-Z\s]+)/i);
  if (countryMatch) {
    entities.country = countryMatch[1].trim().split(/\s+/)[0];
    confidence.country = 90;
  }

  // Skills
  const commonSkills = ['javascript', 'python', 'java', 'html', 'css', 'react', 'node', 'mysql', 'sql', 'c++', 'php'];
  const foundSkills = [];
  commonSkills.forEach(s => {
    if (lowerText.includes(s)) foundSkills.push(s.toUpperCase());
  });
  if (foundSkills.length > 0) {
    entities.skills = foundSkills.join(', ');
    confidence.skills = 95;
  }

  // Register Number match (stops matching at keywords and removes space formatting)
  const regMatch = normalizedText.match(/(?:register number is|roll number is|reg number|roll number|register number|reg no|register)\s*([a-zA-Z0-9\s]+)/i) || 
                   normalizedText.match(/(?:register|roll|reg)\s*(?:no|number)?\s*(?:is)?\s*([a-zA-Z0-9\s]+)/i);
  if (regMatch) {
    const regPart = regMatch[1].trim().split(/\b(?:email|phone|mobile|college|degree|applied|position|living|address|dob|gender|my|is|am|was)\b/i)[0].trim();
    if (regPart) {
      entities.registerNumber = regPart.replace(/\s+/g, '');
      confidence.registerNumber = 95;
    }
  }

  // Applied Position match
  const posMatch = text.match(/(?:position is|role is|applied for|applying for|position|role|job|applied)\s*([a-zA-Z\s]+)/i);
  if (posMatch) {
    entities.position = posMatch[1].trim().split(/\b(?:at|my|in|is|am|was)\b/i)[0].trim();
    confidence.position = 85;
  }

  // Dynamic fields fallback mapping
  if (fields && fields.length > 0) {
    const dynamicEntities = {};
    const dynamicConfidence = {};
    
    fields.forEach(field => {
      dynamicEntities[field] = null;
      dynamicConfidence[field] = 0;
      
      const lowerField = field.toLowerCase();
      // Match against fallback parsed fields
      if (lowerField.includes('name') && !lowerField.includes('college') && !lowerField.includes('company') && !lowerField.includes('father') && !lowerField.includes('mother') && !lowerField.includes('faculty') && !lowerField.includes('teacher') && !lowerField.includes('mentor')) {
        dynamicEntities[field] = entities.fullName;
        dynamicConfidence[field] = confidence.fullName;
      } else if (lowerField.includes('email') || lowerField.includes('mail')) {
        dynamicEntities[field] = entities.email;
        dynamicConfidence[field] = confidence.email;
      } else if (lowerField.includes('phone') || lowerField.includes('mobile') || lowerField.includes('contact')) {
        dynamicEntities[field] = entities.phone;
        dynamicConfidence[field] = confidence.phone;
      } else if (lowerField.includes('register') || lowerField.includes('roll') || lowerField.includes('reg no')) {
        dynamicEntities[field] = entities.registerNumber;
        dynamicConfidence[field] = confidence.registerNumber;
      } else if (lowerField.includes('college') || lowerField.includes('university')) {
        dynamicEntities[field] = entities.collegeName;
        dynamicConfidence[field] = confidence.collegeName;
      } else if (lowerField.includes('degree') || lowerField.includes('course') || lowerField.includes('branch')) {
        dynamicEntities[field] = entities.degree;
        dynamicConfidence[field] = confidence.degree;
      } else if (lowerField.includes('position') || lowerField.includes('role') || lowerField.includes('applied')) {
        dynamicEntities[field] = entities.position;
        dynamicConfidence[field] = confidence.position;
      } else if (lowerField.includes('address') || lowerField.includes('location')) {
        dynamicEntities[field] = entities.address;
        dynamicConfidence[field] = confidence.address;
      } else if (lowerField.includes('gender') || lowerField.includes('sex')) {
        dynamicEntities[field] = entities.gender;
        dynamicConfidence[field] = confidence.gender;
      } else {
        // Dynamic keyword matching (matches full label first, then falls back to last word e.g. "faculty" for "Oracle Academy Faculty")
        const wordsList = lowerField.split(/\s+/);
        const lastWord = wordsList[wordsList.length - 1];
        const regex = new RegExp(`(?:${lowerField}|my ${lowerField}|\\b${lastWord}\\b|\\bmy ${lastWord}\\b)\\s*(?:is)?\\s*([a-zA-Z0-9\\s]+)`, 'i');
        const match = normalizedText.match(regex);
        if (match) {
          // Dynamic splits: exclude the current field keywords (e.g. year/study) to prevent cutting "second year" into "second"
          const baseSplitWords = ['register', 'roll', 'email', 'phone', 'mobile', 'college', 'degree', 'applied', 'position', 'living', 'address', 'dob', 'gender', 'and', 'of', 'year', 'study', 'class', 'faculty', 'mentor', 'teacher'];
          const activeSplitWords = baseSplitWords.filter(word => !lowerField.includes(word));
          const splitRegex = new RegExp(`\\b(?:${activeSplitWords.join('|')})\\b`, 'i');
          
          dynamicEntities[field] = match[1].trim().split(splitRegex)[0].trim();
          dynamicConfidence[field] = 80;
        }
      }
    });
    
    return { entities: dynamicEntities, confidence: dynamicConfidence };
  }

  return { entities, confidence };
}

module.exports = {
  processChat,
  extractProfileFromText,
  translateToEnglish,
  extractEntitiesFromVoice
};
