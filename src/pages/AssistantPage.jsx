import { useRef, useState } from 'react'
import { Bot, Send, User } from 'lucide-react'
import { assistantService } from '../services/adminService'

const SUGGESTIONS = [
  'Where can I find Arduino Uno?',
  'Which equipment is currently available?',
  'What equipment is under maintenance?',
  'Show pending booking requests',
  'Which equipment is most frequently used?',
  'What damage reports exist?',
]

export default function AssistantPage() {
  const [messages, setMessages] = useState([
    { role: 'bot', text: "Hi! I'm LabMate Assistant — connected to the live database. Ask me where equipment is, what's available, what's under maintenance, usage stats, pending bookings, overdue returns, or damage reports." },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)

  const push = (msg) => {
    setMessages((m) => [...m, msg])
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }

  const send = async (text) => {
    const msg = (text ?? input).trim()
    if (!msg || loading) return
    setInput('')
    push({ role: 'user', text: msg })
    setLoading(true)
    try {
      const res = await assistantService.chat(msg)
      push({ role: 'bot', text: res.reply || 'No response from assistant.' })
    } catch (e) {
      push({ role: 'bot', text: e.response?.data?.message || 'Assistant service unavailable. Please try again.' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>AI Assistant</h2>
          <p>Database-connected assistant — answers use real inventory, booking and maintenance data for your role.</p>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="chat-messages">
          {messages.map((m, i) => (
            <div key={i} className={`chat-msg ${m.role}`}>
              <div className="flex" style={{ marginBottom: 6, gap: 6 }}>
                {m.role === 'bot' ? <Bot size={15} /> : <User size={15} />}
                <strong style={{ fontSize: 12 }}>{m.role === 'bot' ? 'LabMate AI' : 'You'}</strong>
              </div>
              <span style={{ whiteSpace: 'pre-wrap' }}>{m.text}</span>
            </div>
          ))}
          {loading && <div className="chat-msg bot"><Bot size={15} /> Querying database…</div>}
          <div ref={bottomRef} />
        </div>

        <div className="chat-suggestions">
          {SUGGESTIONS.map((s) => (
            <button key={s} className="suggestion-chip" onClick={() => send(s)} disabled={loading}>{s}</button>
          ))}
        </div>

        <form className="chat-input-bar" onSubmit={(e) => { e.preventDefault(); send() }}>
          <input className="form-control" placeholder="Ask about equipment, availability, bookings, usage or maintenance…" value={input} onChange={(e) => setInput(e.target.value)} disabled={loading} />
          <button className="btn btn-teal" disabled={loading || !input.trim()}><Send size={16} /></button>
        </form>
      </div>
    </div>
  )
}
