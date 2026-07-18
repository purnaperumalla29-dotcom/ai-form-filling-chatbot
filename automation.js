const { Builder, By } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

/**
 * Automates form filling using Selenium WebDriver.
 * @param {string} formUrl - The target form URL (could be local or remote)
 * @param {Object} extractedData - The JSON data extracted by the chatbot
 */
async function autoFillForm(formUrl, extractedData) {
  const options = new chrome.Options();
  options.addArguments('--no-sandbox');
  options.addArguments('--disable-dev-shm-usage');
  if (process.env.NODE_ENV === 'production') {
    options.addArguments('--headless=new');
  }

  console.log(`[Selenium] Starting browser automation for form: ${formUrl}`);
  console.log(`[Selenium] Data to fill:`, JSON.stringify(extractedData));

  // Initialize the Chrome driver.
  // Note: Selenium 4's Selenium Manager will automatically locate Chrome and download the driver if needed.
  const driver = await new Builder()
    .forBrowser('chrome')
    .setChromeOptions(options)
    .build();

  try {
    // Navigate to the form
    await driver.get(formUrl);
    
    // Brief sleep to ensure the page has loaded
    await driver.sleep(1500);

    // Iterate through each extracted field
    for (const [key, value] of Object.entries(extractedData)) {
      if (value === undefined || value === null || value === '') {
        continue;
      }

      try {
        // Search by element ID first
        let elements = await driver.findElements(By.id(key));

        // If not found by ID, search by Name attribute
        if (elements.length === 0) {
          elements = await driver.findElements(By.name(key));
        }

        if (elements.length > 0) {
          const element = elements[0];
          const tagName = await element.getTagName();
          const type = await element.getAttribute('type');

          if (tagName === 'select') {
            // Dropdown select element
            await element.click();
            await driver.sleep(200); // micro-sleep to simulate human interaction
            
            const optionsList = await element.findElements(By.css('option'));
            let optionSelected = false;

            for (const option of optionsList) {
              const optVal = await option.getAttribute('value');
              const optText = await option.getText();

              if (
                (optVal && optVal.toLowerCase() === String(value).toLowerCase()) ||
                (optText && optText.toLowerCase() === String(value).toLowerCase())
              ) {
                await option.click();
                optionSelected = true;
                break;
              }
            }

            // Fallback: If no exact match, select the first option containing the text
            if (!optionSelected && optionsList.length > 0) {
              for (const option of optionsList) {
                const optText = await option.getText();
                if (optText.toLowerCase().includes(String(value).toLowerCase())) {
                  await option.click();
                  break;
                }
              }
            }
          } else if (type === 'radio' || type === 'checkbox') {
            // Radio button or Checkbox
            // Search for inputs of name=key with value=value
            let checkboxOrRadio = await driver.findElements(By.css(`input[name="${key}"][value="${value}"]`));
            
            if (checkboxOrRadio.length === 0) {
              // Try finding checkbox/radio by matching value case-insensitively
              const allInputs = await driver.findElements(By.css(`input[name="${key}"]`));
              for (const input of allInputs) {
                const valAttr = await input.getAttribute('value');
                if (valAttr && valAttr.toLowerCase() === String(value).toLowerCase()) {
                  await input.click();
                  break;
                }
              }
            } else {
              await checkboxOrRadio[0].click();
            }
          } else if (type === 'file') {
            // File input (e.g. Resume upload)
            const path = require('path');
            const fs = require('fs');
            const absoluteFilePath = path.resolve(__dirname, 'public', 'uploads', 'resume.pdf');
            if (fs.existsSync(absoluteFilePath)) {
              await element.sendKeys(absoluteFilePath);
              console.log(`[Selenium] Successfully uploaded file: "${absoluteFilePath}" into file input "${key}"`);
            } else {
              console.warn(`[Selenium] File upload warning: resume file does not exist at "${absoluteFilePath}"`);
            }
          } else {
            // Standard Text, Email, Date, Tel, or Textarea inputs
            await element.clear();
            await driver.sleep(100);
            
            // Send keys character by character for a nice typing visual effect
            const valStr = String(value);
            for (const char of valStr) {
              await element.sendKeys(char);
              await driver.sleep(50); // 50ms typing delay per character
            }
          }
          console.log(`[Selenium] Successfully filled field: "${key}" with value: "${value}"`);
        } else {
          // Check if it's a radio button group where ID is not the field key
          let radioBtn = await driver.findElements(By.css(`input[name="${key}"][value="${value}"]`));
          if (radioBtn.length > 0) {
            await radioBtn[0].click();
            console.log(`[Selenium] Successfully clicked radio button name: "${key}" value: "${value}"`);
          } else {
            console.warn(`[Selenium] Element with ID or name "${key}" not found on page.`);
          }
        }
      } catch (fieldError) {
        console.error(`[Selenium] Error filling field "${key}":`, fieldError.message);
      }
    }

    console.log('[Selenium] Auto-fill completed. Browser remains open for 20 seconds for user review and submission.');
    await driver.sleep(20000); // Hold open for 20 seconds

  } catch (error) {
    console.error('[Selenium] Automation runtime error:', error.message);
    throw error;
  } finally {
    // Make sure we quit the driver to release resources
    console.log('[Selenium] Closing browser...');
    await driver.quit();
  }
}

module.exports = {
  autoFillForm
};
