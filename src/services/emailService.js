const transporter = require('../config/email');
const emailTemplate = require('./emailTemplate');

class EmailService {
  static formatCurrency(amount, currency = 'usd') {
    try {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(Number(amount || 0));
    } catch (e) {
      return `$${Number(amount || 0).toFixed(2)}`;
    }
  }

  static buildOrderItemsTable(items = [], currency = 'usd') {
    const rows = items.map((item, index) => {
      const eventName = item.display?.name || 'Event';
      const pkg = item.display?.description || 'Package';
      const date = item.eventDate ? new Date(item.eventDate).toLocaleDateString() : '-';
      const qty = item.attendees || 1;
      const price = this.formatCurrency(item.totalPrice, currency);

      return `
        <tr>
          <td style="padding: 12px 10px; border-bottom: 1px solid #eee;">${index + 1}.</td>
          <td style="padding: 12px 10px; border-bottom: 1px solid #eee;">
            <div style="font-weight: 600; color: #333;">${eventName}</div>
            <div style="font-size: 13px; color: #777;">${pkg}</div>
            <div style="font-size: 12px; color: #999;">Date: ${date}</div>
          </td>
          <td style="padding: 12px 10px; border-bottom: 1px solid #eee; text-align:center;">${qty}</td>
          <td style="padding: 12px 10px; border-bottom: 1px solid #eee; text-align:right;">${price}</td>
        </tr>
      `;
    }).join('');

    return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; margin-top: 10px;">
        <thead>
          <tr>
            <th style="text-align:left; padding: 8px 10px; color:#999; font-weight:600; font-size:12px;">#</th>
            <th style="text-align:left; padding: 8px 10px; color:#999; font-weight:600; font-size:12px;">Item</th>
            <th style="text-align:center; padding: 8px 10px; color:#999; font-weight:600; font-size:12px;">Qty</th>
            <th style="text-align:right; padding: 8px 10px; color:#999; font-weight:600; font-size:12px;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    `;
  }

  static buildOrderTotals(subtotal, tax, total, currency = 'usd') {
    return `
      <div style="margin-top: 10px;">
        <div style="display:flex; justify-content: space-between; padding: 6px 4px; color:#555;">
          <span>Subtotal</span>
          <span>${this.formatCurrency(subtotal, currency)}</span>
        </div>
        <div style="display:flex; justify-content: space-between; padding: 6px 4px; color:#555;">
          <span>Tax</span>
          <span>${this.formatCurrency(tax, currency)}</span>
        </div>
        <div style="display:flex; justify-content: space-between; padding: 10px 4px; font-weight:700; color:#333; border-top:1px solid #eee; margin-top:6px;">
          <span>Total</span>
          <span>${this.formatCurrency(total, currency)}</span>
        </div>
      </div>
    `;
  }

  static async sendBookingConfirmationEmail({ toEmail, customerName, sessionId, currency = 'usd', items = [], subtotal = 0, tax = 0, total = 0 }) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const title = 'Your Mehfil Booking is Confirmed!';

    const orderHeader = `
      <div style="text-align:left; margin-bottom: 12px;">
        <div style="font-size:14px; color:#555;">Order Reference</div>
        <div style="font-weight:700; font-size:16px; color:#333;">${sessionId || ''}</div>
      </div>
    `;

    const greeting = `
      <p style="text-align:left;">Hi ${customerName || 'there'},</p>
      <p style="text-align:left;">Thank you for your booking on Mehfil. Your payment was received and your order is confirmed. Below are your booking details:</p>
    `;

    const itemsTable = this.buildOrderItemsTable(items, currency);
    const totals = this.buildOrderTotals(subtotal, tax, total, currency);

    const content = `
      ${orderHeader}
      ${greeting}
      ${itemsTable}
      ${totals}
      <p style="text-align:left; color:#777; font-size:13px;">You'll also find this order in your dashboard under <strong>My Orders</strong>. If anything looks off, reply to this email and we'll help.</p>
    `;

    const button = { text: 'View My Orders', url: `${frontendUrl}/customer_profile_dash?tab=My%20Orders` };

    const html = emailTemplate(title, content, button);

    const message = {
      from: `"Mehfil" <${process.env.EMAIL_USER}>`,
      to: toEmail,
      subject: 'Booking Confirmation - Mehfil',
      html,
    };

    try {
      const info = await transporter.sendMail(message);
      
      return true;
    } catch (error) {
      // Error sending booking confirmation email
      // Do not throw to avoid failing webhook flow
      return false;
    }
  }

  static async sendPasswordResetEmail(email, resetToken, origin) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const resetUrl = `${frontendUrl}/reset-password/${resetToken}`;

    const title = 'Password Reset Request';
    const content = `
      <p>You requested to reset your password. Please click the button below to proceed. This link will expire in 1 hour.</p>
    `;
    const button = { text: 'Reset Password', url: resetUrl };

    const html = emailTemplate(title, content, button);

    const message = {
      from: `"Mehfil" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Password Reset Request - Mehfil',
      html,
    };

    try {
      
      const startTime = Date.now();
      
      const info = await transporter.sendMail(message);
      const endTime = Date.now();
      
      
      
      
      return true;
    } catch (error) {
      // Error sending password reset email
      throw new Error('Failed to send password reset email');
    }
  }

  static async sendPasswordResetConfirmation(email) {
    const title = 'Password Reset Successful';
    const content = `
      <p>Your password has been successfully reset. You can now use your new password to log in.</p>
      <p>If you did not perform this action, please contact our support team immediately.</p>
    `;

    const html = emailTemplate(title, content);

    const message = {
      from: `"Mehfil" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Password Reset Successful - Mehfil',
      html,
    };

    try {
      await transporter.sendMail(message);
      return true;
    } catch (error) {
      // Error sending password reset confirmation
      throw new Error('Failed to send password reset confirmation');
    }
  }

  static async sendVerificationEmail(email, verificationToken, origin) {
    const verificationUrl = `${origin}/api/auth/verify-email/${verificationToken}`;

    const title = 'Welcome to Mehfil!';
    const content = `
      <p>Thank you for signing up! Please click the button below to verify your email address and complete your registration. This link will expire in 24 hours.</p>
    `;
    const button = { text: 'Verify Email', url: verificationUrl };

    const html = emailTemplate(title, content, button);

    const message = {
      from: `"Mehfil" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Email Verification - Mehfil',
      html,
    };

    try {
      await transporter.sendMail(message);
      return true;
    } catch (error) {
      // Error sending verification email
      throw new Error('Failed to send verification email');
    }
  }

  static async sendVerificationSuccessEmail(email) {
    const title = 'Email Verified Successfully!';
    const content = `
      <p>Welcome to the Mehfil community! Your email has been successfully verified, and you can now log in to your account.</p>
    `;

    const html = emailTemplate(title, content);

    const message = {
      from: `"Mehfil" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Email Verified Successfully - Mehfil',
      html,
    };

    try {
      await transporter.sendMail(message);
      return true;
    } catch (error) {
      // Error sending verification success email
      throw new Error('Failed to send verification success email');
    }
  }


  static async sendVendorVerificationRequestEmail({ 
    vendorEmail, 
    vendorName, 
    businessName, 
    phoneNumber, 
    businessAddress, 
    vendorId 
  }) {
    // Sending vendor verification request email
    
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || 'info@mehfil.app';
    const title = '🔍 Vendor Verification Request - Action Required';
    
    // Email configuration loaded

    const vendorDetails = `
      <div style="background-color: #f0f8ff; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #1976d2;">
        <h3 style="color: #1976d2; margin: 0 0 15px 0; font-size: 18px;">👤 Vendor Information</h3>
        <div style="color: #333; line-height: 1.6;">
          <div style="margin-bottom: 8px;"><strong>Business Name:</strong> ${businessName || 'Not provided'}</div>
          <div style="margin-bottom: 8px;"><strong>Owner Name:</strong> ${vendorName || 'Not provided'}</div>
          <div style="margin-bottom: 8px;"><strong>Email:</strong> ${vendorEmail}</div>
          <div style="margin-bottom: 8px;"><strong>Phone:</strong> ${phoneNumber || 'Not provided'}</div>
          <div style="margin-bottom: 8px;"><strong>Vendor ID:</strong> ${vendorId}</div>
        </div>
      </div>
    `;

    const addressDetails = `
      <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #6c757d;">
        <h3 style="color: #6c757d; margin: 0 0 15px 0; font-size: 18px;">📍 Business Address</h3>
        <div style="color: #333; line-height: 1.6;">
          ${businessAddress ? `
            <div style="margin-bottom: 4px;">${businessAddress.street || ''}</div>
            <div style="margin-bottom: 4px;">${businessAddress.city || ''}, ${businessAddress.state || ''} ${businessAddress.zipCode || ''}</div>
            <div style="margin-bottom: 4px;">${businessAddress.country || 'United States'}</div>
          ` : '<div style="color: #999; font-style: italic;">Address not provided</div>'}
        </div>
      </div>
    `;

    const nextSteps = `
      <div style="background-color: #fff3e0; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f57c00;">
        <h3 style="color: #f57c00; margin: 0 0 15px 0; font-size: 18px;">📋 Verification Required</h3>
        <div style="color: #333; line-height: 1.6;">
          <p style="margin: 0 0 10px 0;">A vendor has completed their profile and is requesting verification:</p>
          <ul style="margin: 10px 0; padding-left: 20px;">
            <li style="margin-bottom: 5px;">Review the vendor's business information and documentation</li>
            <li style="margin-bottom: 5px;">Verify their business legitimacy and compliance</li>
            <li style="margin-bottom: 5px;">Approve or reject their verification request</li>
            <li style="margin-bottom: 5px;">Send verification confirmation email to vendor</li>
          </ul>
        </div>
      </div>
    `;

    const content = `
      <p style="text-align:left;">Hello Admin,</p>
      <p style="text-align:left;">A vendor has completed their profile setup and is requesting verification to become an active vendor on Mehfil.</p>
      
      ${vendorDetails}
      ${addressDetails}
      ${nextSteps}
      
      <p style="text-align:left; color:#777; font-size:14px; margin-top: 25px;">
        <strong>Important:</strong> Please review this vendor's verification request promptly to ensure they can start using the platform.
      </p>
      
      <p style="text-align:left; color:#777; font-size:13px; margin-top: 20px;">
        You can manage vendor verification in your <strong>Admin Dashboard</strong> under the Vendors section.
      </p>
    `;

    const button = { 
      text: 'Review Vendor Verification', 
      url: `${frontendUrl}/admin/vendors` 
    };

    const html = emailTemplate(title, content, button);

    const message = {
      from: `"Mehfil" <${process.env.EMAIL_USER}>`,
      to: adminEmail,
      subject: `Vendor Verification Request: ${businessName || vendorName || vendorEmail} - Mehfil`,
      html,
    };

    try {
      // Attempting to send email to admin
      
      const info = await transporter.sendMail(message);
      // Vendor verification request email sent successfully
      return true;
    } catch (error) {
      // Error sending vendor verification request email
      // Do not throw to avoid failing profile completion flow
      return false;
    }
  }

  static async sendVendorVerificationApprovalEmail({ 
    vendorEmail, 
    vendorName, 
    businessName 
  }) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const title = '🎉 Your Vendor Account Has Been Verified!';

    const content = `
      <p style="text-align:left;">Hi ${vendorName || 'there'},</p>
      <p style="text-align:left;">Great news! Your vendor account for <strong>${businessName}</strong> has been successfully verified by our admin team.</p>
      
      <div style="background-color: #e8f5e8; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #4caf50;">
        <h3 style="color: #4caf50; margin: 0 0 15px 0; font-size: 18px;">✅ What's Next?</h3>
        <div style="color: #333; line-height: 1.6;">
          <ul style="margin: 10px 0; padding-left: 20px;">
            <li style="margin-bottom: 5px;">You can now create and manage your event listings</li>
            <li style="margin-bottom: 5px;">Start receiving bookings from customers</li>
            <li style="margin-bottom: 5px;">Access all vendor features in your dashboard</li>
            <li style="margin-bottom: 5px;">Build your reputation with customer reviews</li>
          </ul>
        </div>
      </div>
      
      <p style="text-align:left; color:#777; font-size:14px; margin-top: 25px;">
        <strong>Welcome to the Mehfil vendor community!</strong> We're excited to have you on board.
      </p>
      
      <p style="text-align:left; color:#777; font-size:13px; margin-top: 20px;">
        If you have any questions, feel free to reach out to our support team.
      </p>
    `;

    const button = { 
      text: 'Access Vendor Dashboard', 
      url: `${frontendUrl}/profile_listing` 
    };

    const html = emailTemplate(title, content, button);

    const message = {
      from: `"Mehfil" <${process.env.EMAIL_USER}>`,
      to: vendorEmail,
      subject: 'Vendor Account Verified - Welcome to Mehfil!',
      html,
    };

    try {
      const info = await transporter.sendMail(message);
      // Vendor verification approval email sent successfully
      return true;
    } catch (error) {
      // Error sending vendor verification approval email
      return false;
    }
  }

  static async sendVendorVerificationRejectionEmail({ 
    vendorEmail, 
    vendorName, 
    businessName,
    rejectionReason 
  }) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const title = 'Vendor Verification Update';

    const content = `
      <p style="text-align:left;">Hi ${vendorName || 'there'},</p>
      <p style="text-align:left;">We have reviewed your vendor application for <strong>${businessName}</strong> and unfortunately, we are unable to approve your verification at this time.</p>
      
      <div style="background-color: #fff3e0; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f57c00;">
        <h3 style="color: #f57c00; margin: 0 0 15px 0; font-size: 18px;">📝 Reason for Rejection</h3>
        <div style="color: #333; line-height: 1.6;">
          <p style="margin: 0 0 10px 0;">${rejectionReason || 'Please contact our support team for more details.'}</p>
        </div>
      </div>
      
      <div style="background-color: #f0f8ff; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #1976d2;">
        <h3 style="color: #1976d2; margin: 0 0 15px 0; font-size: 18px;">🔄 Next Steps</h3>
        <div style="color: #333; line-height: 1.6;">
          <ul style="margin: 10px 0; padding-left: 20px;">
            <li style="margin-bottom: 5px;">Review the feedback provided above</li>
            <li style="margin-bottom: 5px;">Update your profile with the required information</li>
            <li style="margin-bottom: 5px;">Contact our support team if you have questions</li>
            <li style="margin-bottom: 5px;">You can reapply for verification once requirements are met</li>
          </ul>
        </div>
      </div>
      
      <p style="text-align:left; color:#777; font-size:14px; margin-top: 25px;">
        We appreciate your interest in joining Mehfil and encourage you to address the feedback to reapply.
      </p>
    `;

    const button = { 
      text: 'Contact Support', 
      url: `${frontendUrl}/contact` 
    };

    const html = emailTemplate(title, content, button);

    const message = {
      from: `"Mehfil" <${process.env.EMAIL_USER}>`,
      to: vendorEmail,
      subject: 'Vendor Verification Update - Mehfil',
      html,
    };

    try {
      const info = await transporter.sendMail(message);
      // Vendor verification rejection email sent successfully
      return true;
    } catch (error) {
      // Error sending vendor verification rejection email
      return false;
    }
  }

  static async sendCancellationRequestEmail({ 
    vendorEmail, 
    vendorName, 
    customerName, 
    customerEmail, 
    customerPhone,
    customerId,
    orderId, 
    eventTitle, 
    eventDate, 
    eventTime, 
    eventLocation, 
    totalAmount, 
    cancellationReason 
  }) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const title = '🚨 New Cancellation Request';

    const orderDetails = `
      <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #d32f2f;">
        <h3 style="color: #d32f2f; margin: 0 0 15px 0; font-size: 18px;">📋 Order Details</h3>
        <div style="color: #333; line-height: 1.6;">
          <div style="margin-bottom: 8px;"><strong>Order ID:</strong> ${orderId}</div>
          <div style="margin-bottom: 8px;"><strong>Event:</strong> ${eventTitle}</div>
          <div style="margin-bottom: 8px;"><strong>Date:</strong> ${eventDate}${eventTime ? ` at ${eventTime}` : ''}</div>
          <div style="margin-bottom: 8px;"><strong>Location:</strong> ${eventLocation}</div>
          <div style="margin-bottom: 8px;"><strong>Total Amount:</strong> ${this.formatCurrency(totalAmount)}</div>
        </div>
      </div>
    `;

    const customerDetails = `
      <div style="background-color: #f0f8ff; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #1976d2;">
        <h3 style="color: #1976d2; margin: 0 0 15px 0; font-size: 18px;">👤 Customer Details</h3>
        <div style="color: #333; line-height: 1.6;">
          <div style="margin-bottom: 8px;"><strong>Name:</strong> ${customerName}</div>
          <div style="margin-bottom: 8px;"><strong>Email:</strong> ${customerEmail}</div>
          <div style="margin-bottom: 8px;"><strong>Phone:</strong> ${customerPhone || 'Not provided'}</div>
        </div>
      </div>
    `;

    const cancellationDetails = `
      <div style="background-color: #fff3e0; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f57c00;">
        <h3 style="color: #f57c00; margin: 0 0 15px 0; font-size: 18px;">📝 Cancellation Request</h3>
        <div style="color: #333; line-height: 1.6;">
          <p style="margin: 0 0 10px 0;">The customer has requested to cancel this booking. Please review the details and respond accordingly.</p>
          <div style="background-color: #fff; padding: 15px; border-radius: 6px; border: 1px solid #e0e0e0;">
            <strong>Reason for Cancellation:</strong><br>
            <em style="color: #666;">${cancellationReason || 'No specific reason provided'}</em>
          </div>
        </div>
      </div>
    `;

    const content = `
      <p style="text-align:left;">Hi ${vendorName || 'there'},</p>
      <p style="text-align:left;">You have received a new cancellation request from a customer. Please review the details below and respond to the customer through your Mehfil dashboard.</p>
      
      ${orderDetails}
      ${customerDetails}
      ${cancellationDetails}
      
      <p style="text-align:left; color:#777; font-size:14px; margin-top: 25px;">
        <strong>Next Steps:</strong><br>
        • Review the cancellation request and reason<br>
        • Check your cancellation policy<br>
        • Respond to the customer through your dashboard<br>
        • Process any applicable refunds if approved
      </p>
      
      <p style="text-align:left; color:#777; font-size:13px; margin-top: 20px;">
        You can view and respond to this message in your <strong>Messages</strong> section on your vendor dashboard.
      </p>
    `;

    const button = { 
      text: 'View Messages', 
      url: `${frontendUrl}/profile_listing?tab=Messages&customerId=${customerId}` 
    };

    const html = emailTemplate(title, content, button);

    const message = {
      from: `"Mehfil" <${process.env.EMAIL_USER}>`,
      to: vendorEmail,
      subject: `Cancellation Request - Order ${orderId} - Mehfil`,
      html,
    };

    try {
      const info = await transporter.sendMail(message);
      // Cancellation request email sent successfully
      return true;
    } catch (error) {
      // Error sending cancellation request email
      // Do not throw to avoid failing message flow
      return false;
    }
  }
}

module.exports = EmailService; 