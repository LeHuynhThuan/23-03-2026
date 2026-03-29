let nodemailer = require('nodemailer')

const DEFAULT_FROM = process.env.MAIL_FROM_ADDRESS || 'admin@nnptud.com'
const DEFAULT_FROM_NAME = process.env.MAIL_FROM_NAME || 'NNPTUD-C2'
const MAILTRAP_HOST = process.env.MAILTRAP_HOST || 'sandbox.smtp.mailtrap.io'
const MAILTRAP_PORT = Number.parseInt(process.env.MAILTRAP_PORT || '2525', 10)
const MAILTRAP_USER = process.env.MAILTRAP_USER || ''
const MAILTRAP_PASSWORD = process.env.MAILTRAP_PASSWORD || ''

const transporter = nodemailer.createTransport({
    host: MAILTRAP_HOST,
    port: MAILTRAP_PORT,
    secure: false,
    auth: {
        user: MAILTRAP_USER,
        pass: MAILTRAP_PASSWORD,
    },
});

function getFrom() {
    return `"${DEFAULT_FROM_NAME}" <${DEFAULT_FROM}>`
}

function getMailBannerSvg() {
    return `
    <svg xmlns="http://www.w3.org/2000/svg" width="600" height="180" viewBox="0 0 600 180">
        <defs>
            <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#0f172a" />
                <stop offset="100%" stop-color="#2563eb" />
            </linearGradient>
        </defs>
        <rect width="600" height="180" rx="20" fill="url(#bg)" />
        <text x="40" y="78" fill="#ffffff" font-size="32" font-family="Arial, Helvetica, sans-serif" font-weight="700">NNPTUD-C2</text>
        <text x="40" y="120" fill="#dbeafe" font-size="18" font-family="Arial, Helvetica, sans-serif">Imported account notification</text>
        <circle cx="520" cy="60" r="22" fill="#93c5fd" />
        <circle cx="520" cy="120" r="34" fill="#bfdbfe" opacity="0.35" />
    </svg>`
}

function escapeHtml(value) {
    return `${value}`
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}

async function sendMail(options) {
    if (!MAILTRAP_USER || !MAILTRAP_PASSWORD) {
        throw new Error('Missing Mailtrap SMTP credentials. Please set MAILTRAP_USER and MAILTRAP_PASSWORD.')
    }

    return await transporter.sendMail({
        from: getFrom(),
        ...options,
    })
}

module.exports = {
    sendMail: async function (to, url) {
        return await sendMail({
            to: to,
            subject: 'mail reset password',
            text: `Click this link to reset your password: ${url}`,
            html: `Click <a href="${url}">here</a> to reset your password`,
        })
    },
    sendImportedUserPasswordMail: async function ({ to, username, password, role }) {
        const safeUsername = escapeHtml(username)
        const safeEmail = escapeHtml(to)
        const safeRole = escapeHtml(role)

        return await sendMail({
            to: to,
            subject: 'Your new account has been created',
            text: [
                'NNPTUD-C2 account information',
                `Username: ${username}`,
                `Email: ${to}`,
                `Password: ${password}`,
                `Role: ${role}`,
                'Please log in and change your password after the first sign-in.'
            ].join('\n'),
            html: `
                <div style="font-family: Arial, Helvetica, sans-serif; background: #f8fafc; padding: 24px; color: #0f172a;">
                    <div style="max-width: 640px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0;">
                        <img src="cid:mailtrap-banner" alt="NNPTUD-C2 banner" style="display: block; width: 100%; height: auto;" />
                        <div style="padding: 24px;">
                            <h2 style="margin-top: 0; margin-bottom: 16px;">Your account is ready</h2>
                            <p style="margin-bottom: 16px;">An account was created from the import file. Use the information below to sign in.</p>
                            <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
                                <tr>
                                    <td style="padding: 10px; border: 1px solid #e2e8f0;"><strong>Username</strong></td>
                                    <td style="padding: 10px; border: 1px solid #e2e8f0;">${safeUsername}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 10px; border: 1px solid #e2e8f0;"><strong>Email</strong></td>
                                    <td style="padding: 10px; border: 1px solid #e2e8f0;">${safeEmail}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 10px; border: 1px solid #e2e8f0;"><strong>Password</strong></td>
                                    <td style="padding: 10px; border: 1px solid #e2e8f0;">${password}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 10px; border: 1px solid #e2e8f0;"><strong>Role</strong></td>
                                    <td style="padding: 10px; border: 1px solid #e2e8f0;">${safeRole}</td>
                                </tr>
                            </table>
                            <p style="margin: 0;">For security, please change this password after the first login.</p>
                        </div>
                    </div>
                </div>
            `,
            attachments: [
                {
                    filename: 'mailtrap-banner.svg',
                    content: Buffer.from(getMailBannerSvg()),
                    contentType: 'image/svg+xml',
                    cid: 'mailtrap-banner',
                    contentDisposition: 'inline'
                }
            ]
        })
    }
}
