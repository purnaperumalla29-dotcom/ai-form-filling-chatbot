const PDFDocument = require('pdfkit');

/**
 * Generates a formatted PDF report summarizing the form submission.
 * @param {Object} extractedData - The JSON payload of form data
 * @param {string} username - Name of the user who requested the form-filling
 * @param {string} email - Email of the user
 * @param {string} formName - Title of the target form
 * @param {WritableStream} stream - Node writable stream (e.g. res object or fs write stream)
 */
function generateFormPDF(extractedData, username, email, formName, stream) {
  const doc = new PDFDocument({ margin: 50 });
  
  // Pipe PDF output to the provided writable stream
  doc.pipe(stream);

  // Color Palette
  const primaryColor = '#0f172a'; // slate-900
  const accentColor = '#4f46e5';  // indigo-600
  const secondaryColor = '#64748b'; // slate-500
  const lightBgColor = '#f8fafc';    // slate-50
  
  // 1. Header Title
  doc.fillColor(accentColor)
     .fontSize(22)
     .font('Helvetica-Bold')
     .text('AI Form Filler Chatbot Report', { align: 'left' });
  
  doc.moveDown(0.3);
  
  // Decorative line
  doc.strokeColor('#cbd5e1')
     .lineWidth(1.5)
     .moveTo(50, doc.y)
     .lineTo(562, doc.y)
     .stroke();
  
  doc.moveDown(1.2);

  // 2. Metadata / Information Block
  doc.fillColor(primaryColor)
     .fontSize(13)
     .font('Helvetica-Bold')
     .text('Session Information');
  
  doc.moveDown(0.4);
  
  const metaY = doc.y;
  doc.fontSize(10)
     .fillColor(secondaryColor)
     .font('Helvetica-Bold').text('Form Name: ', 55, metaY)
     .font('Helvetica').fillColor(primaryColor).text(formName, 130, metaY)
     
     .font('Helvetica-Bold').fillColor(secondaryColor).text('Filled By: ', 55, metaY + 18)
     .font('Helvetica').fillColor(primaryColor).text(`${username} (${email})`, 130, metaY + 18)
     
     .font('Helvetica-Bold').fillColor(secondaryColor).text('Filled Date: ', 55, metaY + 36)
     .font('Helvetica').fillColor(primaryColor).text(new Date().toLocaleString(), 130, metaY + 36);

  doc.moveDown(2.5);

  // 3. Extracted Details Block
  doc.fillColor(primaryColor)
     .fontSize(13)
     .font('Helvetica-Bold')
     .text('Extracted Details');
  
  doc.moveDown(0.5);

  // Setup Table Coordinates
  let y = doc.y;
  const colWidths = [180, 332]; // Total table width is 512
  
  // Table Header
  doc.rect(50, y, 512, 22).fill(primaryColor);
  
  doc.fillColor('#ffffff')
     .font('Helvetica-Bold')
     .fontSize(9.5)
     .text('Field Variable', 60, y + 6)
     .text('Collected Value', 240, y + 6);
  
  y += 22;

  let isAlternateRow = false;
  const data = typeof extractedData === 'string' ? JSON.parse(extractedData) : extractedData;
  
  for (const [key, value] of Object.entries(data)) {
    const displayVal = Array.isArray(value) ? value.join(', ') : String(value);
    
    // Calculate required height for value text (supports wrapped cells)
    const textHeight = doc.heightOfString(displayVal, { width: colWidths[1] - 20 });
    const rowHeight = Math.max(22, textHeight + 10);
    
    // Check if drawing this row overflows page limit
    if (y + rowHeight > 730) {
      doc.addPage();
      y = 50;
      
      // Re-draw Table Header on new page
      doc.rect(50, y, 512, 22).fill(primaryColor);
      doc.fillColor('#ffffff')
         .font('Helvetica-Bold')
         .fontSize(9.5)
         .text('Field Variable', 60, y + 6)
         .text('Collected Value', 240, y + 6);
      y += 22;
    }

    // Draw zebra background for alternate rows
    if (isAlternateRow) {
      doc.rect(50, y, 512, rowHeight).fill(lightBgColor);
    }
    
    // Draw cells
    doc.fillColor(primaryColor)
       .font('Helvetica-Bold')
       .fontSize(9)
       .text(key, 60, y + 6);
    
    doc.font('Helvetica')
       .fontSize(9)
       .text(displayVal, 240, y + 6, { width: colWidths[1] - 20 });
    
    // Draw row cell borders
    doc.strokeColor('#e2e8f0')
       .lineWidth(0.5)
       .rect(50, y, 512, rowHeight)
       .stroke();

    y += rowHeight;
    isAlternateRow = !isAlternateRow;
  }

  doc.moveDown(3);
  
  // Footer note
  doc.fillColor(secondaryColor)
     .fontSize(8.5)
     .font('Helvetica-Oblique')
     .text('This document verifies that the auto-filling bot completed the web form in accordance with the extracted chatbot logs.', { align: 'center' });

  // Finalize the PDF
  doc.end();
}

module.exports = {
  generateFormPDF
};
