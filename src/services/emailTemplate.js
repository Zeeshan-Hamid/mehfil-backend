const emailTemplate = (title, content, button) => {
  const primaryColor = '#AF8EBA';
  const textColor = '#333333';
  const fontFamily = 'Outfit, Helvetica, sans-serif';
  const logoUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/navbar_logo_black.png`;

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;700&display=swap" rel="stylesheet">
      <style>
        body {
          margin: 0;
          padding: 0;
          background-color: #f4f4f7;
          font-family: ${fontFamily};
        }
        .container {
          max-width: 600px;
          margin: 40px auto;
          background-color: #ffffff;
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 10px 30px -10px rgba(0,0,0,0.1);
        }
        .content {
          padding: 20px 40px 30px;
        }
        .logo {
          display: block;
          margin: 30px auto 10px;
          width: 120px;
        }
        h1 {
          color: ${textColor};
          font-size: 26px;
          font-weight: 700;
          text-align: center;
          margin: 20px 0;
        }
        p {
          color: #555555;
          font-size: 16px;
          line-height: 1.7;
          margin-bottom: 20px;
          text-align: center;
        }
        .button-container {
          text-align: center;
          margin: 30px 0;
        }
        .button {
          display: inline-block;
          padding: 15px 35px;
          background-color: ${primaryColor};
          color: #ffffff !important; /* Ensure text is white */
          text-decoration: none !important;
          border-radius: 50px;
          font-size: 16px;
          font-weight: 700;
          letter-spacing: 0.5px;
          box-shadow: 0 4px 15px -5px ${primaryColor};
        }
        .footer {
          text-align: center;
          padding: 20px;
          font-size: 12px;
          color: #999999;
          border-top: 1px solid #eeeeee;
        }
      </style>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f4f4f7; font-family: ${fontFamily};">
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
        <tr>
          <td>
            <div class="container" style="max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 30px -10px rgba(0,0,0,0.1);">
              
              <div class="content" style="padding: 20px 40px 30px;">
                <h1 style="color: ${textColor}; font-size: 26px; font-weight: 700; text-align: center; margin: 20px 0;">${title}</h1>
                ${content}
                ${button ? `
                  <div class="button-container" style="text-align: center; margin: 30px 0;">
                    <a href="${button.url}" target="_blank" class="button" style="display: inline-block; padding: 15px 35px; background-color: ${primaryColor}; color: #ffffff !important; text-decoration: none !important; border-radius: 50px; font-size: 16px; font-weight: 700; letter-spacing: 0.5px; box-shadow: 0 4px 15px -5px ${primaryColor};">
                      ${button.text}
                    </a>
                  </div>` : ''}
              </div>
              <div class="footer" style="text-align: center; padding: 20px; font-size: 12px; color: #999999; border-top: 1px solid #eeeeee;">
                <p style="color: #999999; font-size: 12px; line-height: 1.7; margin-bottom: 0; text-align: center;">&copy; ${new Date().getFullYear()} Mehfil. All rights reserved.</p>
                <p style="color: #999999; font-size: 12px; line-height: 1.7; margin-bottom: 0; text-align: center;">If you did not request this email, please ignore it.</p>
              </div>
            </div>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
};

module.exports = emailTemplate; 