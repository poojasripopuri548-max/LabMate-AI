import { useEffect, useRef, useState } from 'react'
import { Bot, Send, X, Minus } from 'lucide-react'
import { assistantService } from '../../services/adminService'

const WELCOME = "Hi! I'm Labby AI, your laboratory assistant. Ask me about equipment availability, lab locations, bookings — or just chat!"

export function AssistantWidget() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([{ role: 'bot', text: WELCOME }])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, open, loading])

  const send = async (text) => {
    const msg = (text ?? input).trim()
    if (!msg || loading) return
    setInput('')
    setMessages((m) => [...m, { role: 'user', text: msg }])
    setLoading(true)
    try {
      const res = await assistantService.chat(msg)
      setMessages((m) => [...m, { role: 'bot', text: res.reply || 'No response.' }])
    } catch (e) {
      setMessages((m) => [...m, { role: 'bot', text: e.response?.data?.message || 'Assistant unavailable — database may be offline.' }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        className="assistant-fab"
        onClick={() => setOpen(!open)}
        aria-label="Open Labby AI assistant"
        title="Labby AI"
      >
        {open ? <Minus size={22} /> : <Bot size={24} />}
      </button>

      {open && (
        <div className="assistant-popup">
          <div className="assistant-header">
            <div className="flex" style={{ gap: 8 }}>
              <div className="assistant-avatar"><Bot size={18} /></div>
              <div>
                <strong>Labby AI</strong>
                <span className="assistant-status">online · database connected</span>
              </div>
            </div>
            <button className="icon-btn" style={{ padding: 5 }} onClick={() => setOpen(false)} aria-label="Close"><X size={16} /></button>
          </div>

          <div className="assistant-body">
            {messages.map((m, i) => (
              <div key={i} className={`chat-msg ${m.role}`} style={{ maxWidth: '92%', fontSize: 13 }}>
                <span style={{ whiteSpace: 'pre-wrap' }}>{m.text}</span>
              </div>
            ))}
            {loading && <div className="chat-msg bot" style={{ fontSize: 13 }}><Bot size={14} /> Querying…</div>}
            <div ref={bottomRef} />
          </div>

          <form className="assistant-input" onSubmit={(e) => { e.preventDefault(); send() }}>
            <input
              className="form-control"
              placeholder="Ask Labby…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading}
            />
            <button className="btn btn-teal" style={{ padding: '8px 12px' }} disabled={loading || !input.trim()}>
              <Send size={15} />
            </button>
          </form>
        </div>
      )}
    </>
  )
}
