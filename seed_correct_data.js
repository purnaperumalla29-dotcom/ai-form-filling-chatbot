const db = require('./db');

async function seedCorrectProfile() {
  console.log('Seeding database with clean, corrected profile details for user ID 1...');
  
  const correctData = {
    fullName: "P. MADHURI SATYA PURNA JYOTHI",
    email: "jyothiperumalla29@gmail.com",
    phone: "8247398187",
    dob: "2004-04-29",
    gender: "Female",
    course: "MCA",
    position: "Software Engineer",
    experience: "2",
    skills: "Java, HTML, CSS, SQL, C",
    address: "PANGIDIGUDEM, DWARAKA TIRUMALA MANDAL, BOSSU BOMMA CENTER",
    registerNumber: "9240101",
    collegeName: "Sir C.R. Reddy College",
    fatherName: "P. NAGESWARA RAO",
    motherName: "P. VYDEHI",
    aadharNumber: "123456789012",
    nationality: "INDIA",
    languages: "Telugu, English, Hindi",
    hobbies: "Reading, PLAYING GAMES",
    projects: "EMBEDDED SYSTEMS, ROBOTICS",
    tenthPercentage: "9.8 CGPA",
    tenthYear: "2018",
    twelfthPercentage: "95%",
    twelfthYear: "2021",
    graduationCgpa: "8.5 CGPA",
    graduationYear: "2024"
  };

  try {
    const jsonStr = JSON.stringify(correctData);
    
    // Update Form_Data rows for forms 1, 2, 3 for user_id = 1
    const formIds = [1, 2, 3];
    for (const formId of formIds) {
      await db.query(
        'UPDATE Form_Data SET extracted_json = ?, status = ? WHERE user_id = 1 AND form_id = ?',
        [jsonStr, 'pending', formId]
      );
    }
    
    console.log('✔ Successfully seeded database with correct details!');
    process.exit(0);
  } catch (err) {
    console.error('Failed to seed profile:', err.message);
    process.exit(1);
  }
}

seedCorrectProfile();
