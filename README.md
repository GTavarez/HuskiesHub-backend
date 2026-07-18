🥎 HuskiesHub Backend
Empire State Huskies Softball — API, Auth, Schedules, Media Uploads & Integrations

📌 Overview

The HuskiesHub Backend powers the full-stack platform for the
Empire State Huskies Softball Organization — delivering:

🧑‍🤝‍🧑 Player profiles

📅 Team schedules (Google Calendar Sync)

🎓 College commits

🔐 Secure authentication (JWT)

🗂️ GridFS-powered image storage

🧵 Admin-only media upload tools

🚀 Cloud-Run-based global deployment

Built for speed, reliability, and real-time schedule syncing, this backend supports the entire HuskiesHub ecosystem.

⚙️ Tech Stack
Category Technology
Runtime Node.js + Express
Database MongoDB Atlas + GridFS
Auth JWT Authentication
Uploads Multer + GridFS
Scheduling Google Calendar API
Deployment Google Cloud Run
Config dotenv & dotenvx
Logs Google Cloud Run Logs
🔐 Environment Variables

Create a `.env` file:

PORT=8080
MONGO_URI=your_mongo_uri_here
JWT_SECRET=your_jwt_secret
CORS_ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5174,https://www.eshuskiesyoffee.com

# Google Calendar API

GOOGLE_CLIENT_EMAIL=...
GOOGLE_PRIVATE_KEY=...
CALENDAR_ID=...

⚠️ Never commit your .env file, secrets folder, or Google credentials.

💻 Local Installation
git clone https://github.com/yourusername/HuskiesHub-backend.git
cd HuskiesHub-backend
npm install

Run:

npm run dev # Development
npm start # Production

📁 Project Structure
HuskiesHub-backend/
│── app.js
│── db.js
│── src/
│ ├── common/          # shared middlewares (auth, requireRole) & utils (config, gridfs)
│ ├── modules/         # one folder per domain, each with model.js/controller.js/routes.js
│ │ ├── users/         # signup/signin/me
│ │ ├── teams/
│ │ ├── players/
│ │ ├── events/        # practices + games + RSVP
│ │ ├── attendance/
│ │ ├── announcements/
│ │ ├── documents/
│ │ ├── player-notes/  # coach evaluations/injury log/general notes
│ │ ├── messages/      # team chat REST history
│ │ ├── media/         # image/avatar upload + download (admin/images/uploads consolidated)
│ │ ├── contact/
│ │ ├── schedule/      # Google Calendar read-only
│ │ └── payments|recruiting|performance|analytics/  # Phase 2-5 placeholders, not yet implemented
│ └── sockets/         # chat.js
│── uploads/
│── secrets/
│── Dockerfile
│── package.json
└── README.md

📡 API Documentation
🔐 Authentication
POST /signup

Create a new user.

POST /signin

Returns JWT + user object.

GET /me

Returns authenticated user profile.

📅 Schedule Routes
GET /api/schedule

Fetches and normalizes events from Google Calendar.
If credentials are incorrect, returns descriptive error messages.

🖼️ Public Image Access
GET /images/:filename

Example:

GET https://your-cloudrun-url/images/ac.jpg

Streams GridFS image directly to the browser.

🔒 Admin Upload API

Requires a signed-in user with `role: "admin"`:

Authorization: Bearer <jwt>

POST /admin?slug=<slug>

Upload a player or team image.

Example cURL:

curl -v \
 -H "Authorization: Bearer $JWT" \
 -F "file=@uploads/players/ac.jpg" \
 "https://your-cloudrun-url/admin?slug=ac"

Success Response:

{
"message": "Uploaded",
"filename": "ac.jpg"
}

🔄 Google Calendar Integration

The backend uses:

GOOGLE_CLIENT_EMAIL

GOOGLE_PRIVATE_KEY

CALENDAR_ID

Events are:

✔ Cleaned
✔ Sorted
✔ Normalized
✔ Returned to frontend

If the service account key is missing:

Google Calendar API Error: ENOENT: no such file or directory

Cloud Run logs show detailed debugging information.

🚀 Google Cloud Run Deployment
Deploy with Source Build
gcloud run deploy huskieshub-backend \
 --source . \
 --region=us-central1 \
 --platform=managed \
 --allow-unauthenticated \
 --set-env-vars "MONGO_URI=$MONGO_URI" \
  --set-env-vars "JWT_SECRET=$JWT_SECRET" \
 --set-env-vars "CORS_ALLOWED_ORIGINS=$CORS_ALLOWED_ORIGINS" \
 --set-env-vars "GOOGLE_CLIENT_EMAIL=$GOOGLE_CLIENT_EMAIL" \
 --set-env-vars "GOOGLE_PRIVATE_KEY=$GOOGLE_PRIVATE_KEY" \
  --set-env-vars "CALENDAR_ID=$CALENDAR_ID"

Set `CORS_ALLOWED_ORIGINS` to a comma-separated list that includes your final frontend domain plus any local origins you still use.

View Logs
gcloud run services logs read huskieshub-backend --region=us-central1

Check Deployment
gcloud run services describe huskieshub-backend --region=us-central1

🏷️ GitHub Release Notes Template
v1.0.0 — Initial Production Release

JWT authentication

GridFS upload + admin tooling

Google Calendar schedule sync

Cloud Run deployment

Enhanced CORS & security headers

Fully stable backend foundation

🖼️ Screenshots

Replace these with real screenshots.

📸 Player Gallery

📅 Schedule API Response

🥎 HuskiesHub Softball Logo

(Replace with actual logo)

<p align="left"> <img src="https://via.placeholder.com/250x250/001A33/FFFFFF?text=HuskiesHub+Logo" width="180"/> </p>
🤝 Contributing

Contributions are welcome — open an issue or submit a pull request.

📄 License

MIT License.
