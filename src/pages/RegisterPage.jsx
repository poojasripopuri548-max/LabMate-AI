import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import { FlaskConical } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' })
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)

  const validate = () => {
    const e = {}
    if (form.name.trim().length < 2) e.name = 'Enter your full name'
    if (!/^\S+@\S+\.\S+$/.test(form.email)) e.email = 'Enter a valid email'
    if (form.password.length < 8) e.password = 'Password must be at least 8 characters'
    if (form.password !== form.confirm) e.confirm = 'Passwords do not match'
    setErrors(e)
    return !Object.keys(e).length
  }

  const submit = async (ev) => {
    ev.preventDefault()
    if (!validate()) return
    setLoading(true)
    try {
      const user = await register(form)
      toast.success('Registration successful')
      navigate('/dashboard')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="brand-mark"><FlaskConical size={22} /></div>
          <div><h1>LabMate AI</h1><span>Create student account</span></div>
        </div>
        <form onSubmit={submit}>
          <div className="form-group">
            <label>Full Name</label>
            <input className="form-control" value={form.name} onChange={set('name')} placeholder="Your name" />
            {errors.name && <p className="form-error">{errors.name}</p>}
          </div>
          <div className="form-group">
            <label>Email</label>
            <input className="form-control" type="email" value={form.email} onChange={set('email')} placeholder="you@vignan.edu" />
            {errors.email && <p className="form-error">{errors.email}</p>}
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Password</label>
              <input className="form-control" type="password" value={form.password} onChange={set('password')} />
              {errors.password && <p className="form-error">{errors.password}</p>}
            </div>
            <div className="form-group">
              <label>Confirm</label>
              <input className="form-control" type="password" value={form.confirm} onChange={set('confirm')} />
              {errors.confirm && <p className="form-error">{errors.confirm}</p>}
            </div>
          </div>
          <button className="btn btn-primary btn-block" disabled={loading}>
            {loading ? 'Creating account…' : 'Register'}
          </button>
        </form>
        <p className="role-note">Public registration creates a student account. Faculty and admin accounts are provisioned by the institution.</p>
        <p className="auth-footer">Already registered? <Link to="/login">Sign in</Link></p>
      </div>
    </div>
  )
}
