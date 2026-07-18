const { getTransporter } = require("../../common/utils/mailer");

const sendContactMessage = async (req, res) => {
  try {
    const { name, email, message } = req.body;

    if (!name || !email || !message) {
      return res
        .status(400)
        .json({ message: "Name, email, and message are required." });
    }

    const toEmail = process.env.CONTACT_TO_EMAIL || process.env.SMTP_USER;
    const fromEmail = process.env.CONTACT_FROM_EMAIL || process.env.SMTP_USER;
    if (!toEmail || !fromEmail) {
      return res
        .status(500)
        .json({ message: "Contact email is not configured." });
    }

    const transporter = getTransporter();
    const subject = `HuskiesHub Tryout/Contact Request - ${name}`;

    await transporter.sendMail({
      from: fromEmail,
      to: toEmail,
      replyTo: email,
      subject,
      text: [`Name: ${name}`, `Email: ${email}`, "", "Message:", message].join(
        "\n"
      ),
      html: `
        <h2>HuskiesHub Contact Request</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Message:</strong></p>
        <p>${String(message).replace(/\n/g, "<br/>")}</p>
      `,
    });

    return res.status(200).json({ message: "Message sent successfully." });
  } catch (error) {
    console.error("Contact email error:", error);
    return res.status(500).json({ message: "Failed to send message." });
  }
};

module.exports = { sendContactMessage };
