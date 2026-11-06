# LabMate AI – Intelligent Laboratory and Equipment Management System

LabMate AI is a full-stack, AI-powered laboratory management platform designed to simplify laboratory operations, equipment booking, availability tracking, maintenance monitoring, and intelligent equipment recommendations.

The platform integrates a React frontend, Node.js backend, Python-based Machine Learning service, and MongoDB database to provide a centralized laboratory management solution.

## 🌐 Live Demo

- **Frontend:** https://labmate-ai-iajh.onrender.com/
- **Backend API:** https://labmate-ai-backend.onrender.com/
- **ML Service:** https://labmate-ai-1-rwrt.onrender.com/
- **ML API Documentation:** https://labmate-ai-1-rwrt.onrender.com/docs

## ✨ Features

- **User Authentication:** User registration, login, and JWT-based authentication.
- **Laboratory Management:** View and manage laboratory information.
- **Equipment Management:** Manage laboratory equipment and its status.
- **Equipment Booking:** Submit and manage equipment booking requests.
- **Availability Tracking:** Check equipment availability.
- **AI Recommendations:** Get intelligent equipment recommendations.
- **Usage Analysis:** Analyze equipment usage and booking activity.
- **Maintenance Analysis:** Generate maintenance insights using machine learning.
- **Damage Reports:** Submit and track equipment damage reports.
- **Notifications:** Receive relevant system notifications.
- **AI Assistant:** Interact with an integrated AI assistant.

## 🛠️ Technology Stack

| Component | Technologies |
|---|---|
| Frontend | React.js, Vite, JavaScript, CSS |
| Backend | Node.js, Express.js |
| Machine Learning | Python, FastAPI, Pandas, NumPy, Scikit-learn |
| Database | MongoDB Atlas |
| Authentication | JWT, bcryptjs |
| Deployment | Render |
| API Communication | REST APIs, Axios |

## 🏗️ System Architecture

```text
             USER
               |
               v
       React + Vite Frontend
               |
               v
       Node.js + Express API
          /          \
         v            v
    MongoDB Atlas   Python ML Service
                         |
                         v
                  Machine Learning
                  Recommendations
                  Usage Analysis
                  Maintenance Analysis
```

## 📂 Project Structure

```text
LabMate-AI/
│
├── backend/
│   ├── config/
│   ├── controllers/
│   ├── middleware/
│   ├── models/
│   ├── routes/
│   ├── server.js
│   └── package.json
│
├── ml-service/
│   ├── ai_module/
│   ├── reports/
│   ├── api.py
│   ├── mongo_adapter.py
│   └── requirements.txt
│
├── src/
│   ├── components/
│   ├── pages/
│   ├── services/
│   └── App.jsx
│
├── index.html
├── package.json
├── vite.config.js
└── README.md
```

## ⚙️ Installation and Setup

### 1. Clone the repository

```bash
git clone https://github.com/poojasripopuri548-max/LabMate-AI.git
cd LabMate-AI
```

### 2. Install frontend dependencies

```bash
npm install
```

Create a root `.env` file:

```env
VITE_API_URL=http://localhost:5000
```

Start the frontend:

```bash
npm run dev
```

### 3. Configure the Node.js backend

```bash
cd backend
npm install
```

Create `backend/.env`:

```env
PORT=5000
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret
ADMIN_NAME=your_admin_name
ADMIN_EMAIL=your_admin_email
ADMIN_PASSWORD=your_admin_password
ML_SERVICE_URL=http://127.0.0.1:8001
```

Start the backend:

```bash
npm run dev
```

### 4. Configure the Python ML service

Open another terminal:

```bash
cd ml-service
```

Create and activate a virtual environment:

```bash
python -m venv venv
```

Windows PowerShell:

```powershell
.\venv\Scripts\Activate.ps1
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Create `ml-service/.env`:

```env
MONGODB_URI=your_mongodb_connection_string
MONGODB_DB=your_database_name
```

Start the ML service:

```bash
uvicorn api:app --host 127.0.0.1 --port 8001 --reload
```

## 🔗 API Services

| Service | Endpoint |
|---|---|
| Backend Health | `/api/health` |
| User Registration | `POST /api/auth/register` |
| User Login | `POST /api/auth/login` |
| ML Recommendations | `/api/ml/recommendations` |
| Usage Analysis | `/api/ml/usage-analysis` |
| Maintenance Analysis | `/api/ml/maintenance-analysis` |
| ML Documentation | `/docs` |

## 🚀 Deployment

The application is deployed using Render.

- React frontend is deployed as a Static Site.
- Node.js backend is deployed as a Web Service.
- Python FastAPI ML service is deployed as a separate Web Service.
- MongoDB Atlas provides cloud database storage.

## 🔐 Security

- JWT-based authentication.
- Password hashing using bcryptjs.
- Protected backend API routes.
- Environment variables for sensitive configuration.
- Database credentials and secrets should never be committed to GitHub.

## 🎯 Project Objective

The objective of LabMate AI is to improve laboratory resource utilization, simplify equipment management, reduce manual booking processes, and support smarter maintenance decisions through machine learning.

## 👩‍💻 Author

**Pooja Sri Popuri**

GitHub: https://github.com/poojasripopuri548-max

---

*LabMate AI – Making Laboratory Management Smarter with AI.*