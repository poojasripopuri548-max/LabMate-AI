import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import { FlaskConical, Eye, EyeOff, GraduationCap, Briefcase, ShieldCheck } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const ROLES = [
  { key: 'student', label: 'Student', icon: GraduationCap, hint: 'Students & researchers' },
  { key: 'faculty', label: 'Faculty', icon: Briefcase, hint: 'Faculty members' },
  { key: 'admin', label: 'Admin', icon: ShieldCheck, hint: 'System administrators' },
]

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [role, setRole] = useState('student')
  const [form, setForm] = useState({ email: '', password: '' })
  const [showPw, setShowPw] = useState(false)
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)

  const validate = () => {
    const e = {}
    if (!/^\S+@\S+\.\S+$/.test(form.email)) e.email = 'Enter a valid email'
    if (!form.password) e.password = 'Password is required'
    setErrors(e)
    return !Object.keys(e).length
  }

  const submit = async (ev) => {
    ev.preventDefault()
    if (!validate()) return
    setLoading(true)
    try {
      const user = await login(form)
      if (user.role !== role) {
        toast.warning(`Signed in as ${user.role} — your actual role was used.`)
      } else {
        toast.success(`Welcome back, ${user.name}`)
      }
      navigate('/dashboard')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="brand-mark"><FlaskConical size={22} /></div>
          <div><h1>LabMate AI</h1><span>Sign in to your account</span></div>
        </div>

        <div className="tabs" style={{ marginBottom: 20 }}>
          {ROLES.map(({ key, label, icon: Icon }) => (
            <button key={key} type="button"
              className={`tab-btn ${role === key ? 'active' : ''}`}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              onClick={() => setRole(key)}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
        <p className="role-note" style={{ marginTop: -12, marginBottom: 14 }}>
          {ROLES.find((r) => r.key === role)?.hint} — your role is verified by the server on login.
        </p>

        <form onSubmit={submit}>
          <div className="form-group">
            <label>Email</label>
            <input className="form-control" type="email" placeholder="you@vignan.edu" value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })} />
            {errors.email && <p className="form-error">{errors.email}</p>}
          </div>
          <div className="form-group">
            <label>Password</label>
            <div style={{ position: 'relative' }}>
              <input className="form-control" type={showPw ? 'text' : 'password'} placeholder="••••••••"
                style={{ paddingRight: 42 }} value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })} />
              <button type="button" onClick={() => setShowPw(!showPw)} aria-label="Toggle password"
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--muted)' }}>
                {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
            {errors.password && <p className="form-error">{errors.password}</p>}
          </div>
          <button className="btn btn-primary btn-block" disabled={loading}>
            {loading ? 'Signing in…' : `Login as ${ROLES.find((r) => r.key === role)?.label}`}
          </button>
        </form>
        <p className="auth-footer">New student? <Link to="/register">Create an account</Link></p>
      </div>
    </div>
  )
}
