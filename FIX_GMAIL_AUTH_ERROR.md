# Fix Gmail Authentication Error

## Problem
Your backend logs show: **"Authentication failed"** when trying to send emails.

This means the SMTP connection works (TLS is fine) but Gmail rejected your username/password.

## Root Cause
Your `.env` has:
```
MAIL_PASSWORD=Al9844058
```

If your Gmail account uses **2-Factor Authentication (2FA)**, Gmail **does not allow** logging in with your regular account password via SMTP. You must create and use an **App Password** instead.

## Solution: Create a Gmail App Password

### Step 1: Check if Your Account Uses 2FA
1. Go to https://myaccount.google.com/security
2. Look for **"2-Step Verification"** — if it's enabled, you need an App Password
3. If it's disabled, you can use your account password (but 2FA is recommended)

### Step 2: Generate an App Password (if 2FA is enabled)

1. Go to https://myaccount.google.com/security (must be logged in)
2. Under "How you sign in to Google", find **"App passwords"**
   - (If you don't see it, enable 2-Step Verification first)
3. Select:
   - **App**: Mail
   - **Device**: Select your device or "Windows Computer" (doesn't matter)
4. Google generates a **16-character app password** (example: `abcd efgh ijkl mnop`)
5. **Copy this password** (it won't be shown again)

### Step 3: Update Your .env

Replace `MAIL_PASSWORD` with the 16-character app password:

```bash
# Old (doesn't work with 2FA):
MAIL_PASSWORD=Al9844058

# New (App Password for 2FA):
MAIL_PASSWORD=abcdefghijklmnop
```

**Example** (replace with your actual app password):
```dotenv
MAIL_USERNAME=alanriordan10@gmail.com
MAIL_PASSWORD=kqwvlzxcmnbqwert
```

### Step 4: Rebuild and Test

1. Save `.env`
2. Rebuild backend:
   ```bash
   cd backend
   mvn clean package -DskipTests -q
   ```
3. Load env and run:
   ```bash
   export $(grep -v '^#' .env | xargs -d '\n')
   java -jar target/lastmanstanding-0.0.1-SNAPSHOT.jar
   ```
4. Trigger an email send
5. Check logs for: `Sent GW* result email to alanriordan10@gmail.com`

## Quick Check: Is Your Account Using 2FA?

Open https://myaccount.google.com/security and look for:
- ✅ **2-Step Verification: On** → You MUST use App Password
- ❌ **2-Step Verification: Off** → You can use account password (but enable it!)

## If You See "Authentication failed" Still

1. **Verify the app password**:
   - Copy/paste carefully (16 chars, no spaces except internal)
   - Test in https://myaccount.google.com/security → App passwords
   - Create a new one if needed

2. **Check username is correct**:
   ```bash
   grep MAIL_USERNAME .env
   # Should show: alanriordan10@gmail.com
   ```

3. **Verify .env is loaded**:
   ```bash
   export $(grep -v '^#' .env | xargs -d '\n')
   echo $MAIL_PASSWORD  # Should show the app password
   ```

4. **Check for spaces/typos**:
   - App passwords are case-sensitive
   - Make sure there are no extra spaces

## If Your Account Doesn't Use 2FA

If your account does NOT have 2FA enabled, your current password should work. Try:

1. Verify 2-Step Verification is OFF:
   - https://myaccount.google.com/security → look for "2-Step Verification"

2. If it's OFF, your account might have "Less secure app access" disabled
   - Go to https://myaccount.google.com/lesssecureapps
   - Toggle ON (if available)
   - Note: Google may not show this option for newer accounts

3. Rebuild and test again

## Recommended: Enable 2FA + Use App Password

For security best practices:
1. ✅ Keep 2FA enabled (more secure)
2. ✅ Use App Password for mail (more secure than account password)
3. ✅ Never commit `.env` (use `.gitignore`)

## Reference

- **Gmail SMTP Settings**: https://support.google.com/mail/answer/7126229
- **App Passwords**: https://support.google.com/accounts/answer/185833
- **Security Checkup**: https://myaccount.google.com/security

---

**Next steps**: Create an App Password (if 2FA enabled) or enable Less Secure Apps (if 2FA disabled), update `.env`, rebuild, and test!
