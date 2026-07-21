-- Database initialization script for AI-Powered Form Filling Chatbot
CREATE DATABASE IF NOT EXISTS ai_form_filler;
USE ai_form_filler;

-- 1. users Table
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'user',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Chat History Table
CREATE TABLE IF NOT EXISTS chat_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    sender VARCHAR(10) NOT NULL, -- 'user' or 'bot'
    message TEXT NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 3. forms Table
CREATE TABLE IF NOT EXISTS forms (
    id INT AUTO_INCREMENT PRIMARY KEY,
    form_name VARCHAR(100) NOT NULL,
    form_url VARCHAR(255) NOT NULL,
    fields_schema TEXT NOT NULL, -- JSON string mapping the expected inputs
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Form Data Table
CREATE TABLE IF NOT EXISTS form_data (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    form_id INT NOT NULL,
    extracted_json TEXT NOT NULL, -- JSON string of filled details
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'filled', 'submitted'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (form_id) REFERENCES forms(id) ON DELETE CASCADE
);

-- 5. admin Table
CREATE TABLE IF NOT EXISTS admin (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL UNIQUE,
    permission_level VARCHAR(20) DEFAULT 'moderator',
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Seed Sample forms
INSERT INTO forms (id, form_name, form_url, fields_schema) VALUES
(1, 'Student Registration Form', '/forms/student_registration.html', 
'[{"name":"fullName","label":"Full Name","type":"text","required":true},{"name":"email","label":"Email Address","type":"email","required":true},{"name":"phone","label":"Phone Number","type":"tel","required":true},{"name":"dob","label":"Date of Birth","type":"date","required":true},{"name":"gender","label":"Gender","type":"select","options":["Male","Female","Other"],"required":true},{"name":"course","label":"Course","type":"select","options":["MCA","BCA","MTech","BTech"],"required":true},{"name":"address","label":"Address","type":"textarea","required":true}]'),

(2, 'Job Application Form', '/forms/job_application.html', 
'[{"name":"fullName","label":"Full Name","type":"text","required":true},{"name":"email","label":"Email Address","type":"email","required":true},{"name":"phone","label":"Phone Number","type":"tel","required":true},{"name":"position","label":"Applied Position","type":"select","options":["Software Engineer","Frontend Developer","Backend Developer","QA Engineer"],"required":true},{"name":"experience","label":"Experience (Years)","type":"number","required":true},{"name":"skills","label":"Skills","type":"text","required":true},{"name":"resume","label":"Upload Resume (PDF)","type":"file","required":true}]'),

(3, 'Customer Feedback Form', '/forms/feedback.html', 
'[{"name":"fullName","label":"Full Name","type":"text","required":true},{"name":"email","label":"Email Address","type":"email","required":true},{"name":"rating","label":"Service Rating","type":"select","options":["Excellent","Good","Average","Poor"],"required":true},{"name":"comments","label":"Feedback Comments","type":"textarea","required":true},{"name":"recommend","label":"Recommend to Others","type":"radio","options":["Yes","No"],"required":true}]')
ON DUPLICATE KEY UPDATE form_name=VALUES(form_name), form_url=VALUES(form_url), fields_schema=VALUES(fields_schema);
SHOW TABLES;
SELECT * FROM users;