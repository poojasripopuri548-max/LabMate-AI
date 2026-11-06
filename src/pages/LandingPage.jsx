import { Link } from 'react-router-dom'
import {
  FlaskConical, Bot, CalendarCheck, BarChart3, ShieldCheck,
  ArrowRight, CheckCircle2, Clock, Users, Wrench,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const features = [
  { icon: CalendarCheck, title: 'Smart Booking', text: 'Check real-time availability and reserve lab equipment with validated time slots.' },
  { icon: Bot, title: 'AI Recommendations', text: 'Get intelligent equipment suggestions powered by TF-IDF similarity analysis.' },
  { icon: BarChart3, title: 'Usage Analytics', text: 'Visualize utilization, booking trends and equipment performance with live charts.' },
  { icon: Wrench, title: 'Maintenance Insights', text: 'Condition-based maintenance prioritization keeps labs running safely.' },
  { icon: Clock, title: 'Real-Time Availability', text: 'Instant overlap detection prevents double-booking across all laboratories.' },
  { icon: ShieldCheck, title: 'Role-Based Access', text: 'Separate workflows for students, faculty and administrators.' },
]

const steps = [
  { title: 'Create your account', text: 'Register as a student or sign in with your faculty/admin credentials.' },
  { title: 'Browse equipment', text: 'Search the catalog, filter by lab, category and availability.' },
  { title: 'Book a slot', text: 'Pick a date and time — the system validates availability instantly.' },
  { title: 'Get AI insights', text: 'Receive recommendations, usage analytics and maintenance priorities.' },
]

export default function LandingPage() {
  const { user } = useAuth()

  return (
    <div className="landing">
      <div className="uni-topbar">
        <strong>Vignan's Foundation for Science, Technology and Research</strong> (Deemed to be University) · Vadlamudi, Guntur – 522213 · +91 863 2344700 · info@vignan.ac.in
      </div>
      <header className="landing-nav">
        <div className="brand">
          <div className="brand-mark"><FlaskConical size={22} /></div>
          LabMate AI
        </div>
        <nav>
          <a href="#features">Features</a>
          <a href="#how-it-works">How It Works</a>
          <a href="#ai">AI Powered</a>
        </nav>
        <div className="nav-cta">
          {user ? (
            <Link to="/dashboard" className="btn btn-primary btn-sm">Dashboard</Link>
          ) : (
            <>
              <Link to="/login" className="btn btn-secondary btn-sm">Login</Link>
              <Link to="/register" className="btn btn-primary btn-sm">Get Started</Link>
            </>
          )}
        </div>
      </header>

      <section className="hero">
        <div className="hero-badge"><Bot size={15} /> AI-Powered Laboratory Management</div>
        <h1>Intelligent Equipment Management for <span className="accent">Vignan's Foundation</span></h1>
        <p>
          LabMate AI streamlines laboratory operations at VFSTR — students and faculty can browse,
          book and track equipment in real time, while AI-driven recommendations and analytics
          optimize utilization across every lab.
        </p>
        <div className="hero-actions">
          <Link to={user ? '/dashboard' : '/register'} className="btn btn-teal">
            Get Started <ArrowRight size={17} />
          </Link>
          <Link to="/login" className="btn btn-secondary">Login</Link>
        </div>
      </section>

      <section className="section" id="features">
        <div className="section-head">
          <h2>Everything your lab needs</h2>
          <p>A complete platform for equipment inventory, booking, returns and AI-assisted decision making.</p>
        </div>
        <div className="feature-grid">
          {features.map(({ icon: Icon, title, text }) => (
            <div className="feature-card" key={title}>
              <div className="feature-icon"><Icon size={21} /></div>
              <h3>{title}</h3>
              <p>{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section section-alt" id="how-it-works">
        <div className="section-head">
          <h2>How It Works</h2>
          <p>From registration to AI-powered insights in four simple steps.</p>
        </div>
        <div className="steps">
          {steps.map((s, i) => (
            <div className="step-card" key={i}>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section" id="ai">
        <div className="section-head">
          <h2>Powered by Machine Learning</h2>
          <p>Our Python ML service analyzes usage patterns and equipment condition to surface
          recommendations, utilization insights and maintenance priorities — all explained, never black-box.</p>
        </div>
        <div className="feature-grid">
          <div className="feature-card">
            <div className="feature-icon"><SparklesIcon /></div>
            <h3>Equipment Recommendations</h3>
            <p>Describe your experiment and get ranked alternatives based on TF-IDF text similarity over the live catalog.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon"><BarChart3 size={21} /></div>
            <h3>Utilization Intelligence</h3>
            <p>See which equipment is frequently used, underutilized or idle — with real utilization percentages from booking records.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon"><Users size={21} /></div>
            <h3>Condition-Based Maintenance</h3>
            <p>Transparent priority scoring flags damaged, pending-repair and high-complaint equipment for immediate attention.</p>
          </div>
        </div>
        <div className="mt-24" style={{ textAlign: 'center' }}>
          <Link to={user ? '/dashboard' : '/register'} className="btn btn-primary">
            {user ? 'Open Dashboard' : 'Create Free Account'} <ArrowRight size={17} />
          </Link>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="footer-inner">
          <div style={{ maxWidth: 320 }}>
            <div className="brand" style={{ color: '#fff', marginBottom: 12 }}>
              <div className="brand-mark"><FlaskConical size={20} /></div> LabMate AI
            </div>
            <p>Intelligent Laboratory and Equipment Management System developed for VFSTR — Vignan's Foundation for Science, Technology and Research.</p>
          </div>
          <div>
            <h4>Platform</h4>
            <p><Link to="/equipment">Equipment Catalog</Link></p>
            <p><Link to="/recommendations">AI Recommendations</Link></p>
            <p><Link to="/analytics">Analytics</Link></p>
          </div>
          <div>
            <h4>Account</h4>
            <p><Link to="/login">Student Login</Link></p>
            <p><Link to="/login">Faculty / Admin Login</Link></p>
            <p><Link to="/register">Register</Link></p>
          </div>
          <div>
            <h4>Institution</h4>
            <p>Vignan's Foundation for Science, Technology and Research</p>
            <p>Department of Computer Science & Engineering</p>
            <p>Andhra Pradesh, India</p>
          </div>
        </div>
        <div className="footer-bottom">
          © {new Date().getFullYear()} LabMate AI · Built for VFSTR · All laboratory data is managed securely via authenticated APIs.
        </div>
      </footer>
    </div>
  )
}

function SparklesIcon() {
  return <CheckCircle2 size={21} />
}
