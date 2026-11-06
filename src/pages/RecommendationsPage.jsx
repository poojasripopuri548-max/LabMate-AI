import { useState } from 'react'
import { toast } from 'react-toastify'
import { Sparkles, Search, ArrowRight } from 'lucide-react'
import { Spinner, EmptyState, ErrorState, StatusBadge } from '../components/common/UI'
import { recommendationService } from '../services/recommendationService'
import { Link } from 'react-router-dom'

const SUGGESTIONS = [
  'compound microscope for cell biology practical',
  'centrifuge for blood sample separation',
  'pH meter for chemistry titration',
  'spectrophotometer for UV analysis',
]

export default function RecommendationsPage() {
  const [query, setQuery] = useState('')
  const [topN, setTopN] = useState(5)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  const search = async (q) => {
    const text = (q ?? query).trim()
    if (text.length < 2) { toast.info('Describe your requirement in at least 2 characters'); return }
    setLoading(true); setSearched(true)
    try {
      const data = await recommendationService.getRecommendations(text, topN)
      setResult(data)
    } catch (e) {
      setResult(null)
      toast.error(e.response?.data?.message || 'Recommendation service unavailable')
    } finally {
      setLoading(false)
    }
  }

  const recs = result?.recommendations || []

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>AI Equipment Recommendations</h2>
          <p>Describe your experiment — our ML service ranks available equipment by text similarity.</p>
        </div>
      </div>

      <div className="card mb-16">
        <form
          onSubmit={(e) => { e.preventDefault(); search() }}
          className="flex"
          style={{ gap: 10 }}
        >
          <div className="search-box" style={{ flex: 1 }}>
            <Search size={16} />
            <input className="form-control" placeholder="e.g. microscope for microbiology lab" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <select className="form-control" style={{ width: 'auto' }} value={topN} onChange={(e) => setTopN(Number(e.target.value))}>
            {[3, 5, 8].map((n) => <option key={n} value={n}>Top {n}</option>)}
          </select>
          <button className="btn btn-teal" disabled={loading}><Sparkles size={16} /> {loading ? 'Analyzing…' : 'Recommend'}</button>
        </form>
        <div className="flex mt-16" style={{ gap: 8, flexWrap: 'wrap' }}>
          {SUGGESTIONS.map((s) => (
            <button key={s} className="suggestion-chip" onClick={() => { setQuery(s); search(s) }}>{s}</button>
          ))}
        </div>
      </div>

      {loading && <Spinner label="Running TF-IDF similarity analysis…" />}

      {!loading && searched && result && (
        <div className="card">
          <p className="card-sub">{result.message} · Query: “{result.query_used}”</p>
          {recs.length === 0 ? (
            <EmptyState icon={Sparkles} title="No matches" message="Try a different description or check back when more equipment is catalogued." />
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>#</th><th>Equipment</th><th>Category</th><th>Location</th><th>Avail. Qty</th><th>Score</th><th>Match</th><th></th></tr></thead>
                <tbody>
                  {recs.map((r) => (
                    <tr key={r.rank}>
                      <td>{r.rank}</td>
                      <td><strong>{r.equipment_name}</strong><br /><span className="equip-id">{r.equipment_id}</span></td>
                      <td>{r.category || '—'}</td>
                      <td className="text-sm">{r.lab_location || '—'}</td>
                      <td>{r.available_quantity}</td>
                      <td>{r.relevance_score != null ? `${Math.round(r.relevance_score * 100)}%` : '—'}</td>
                      <td><StatusBadge status={r.match_strength === 'strong text match' ? 'available' : r.match_strength === 'moderate text match' ? 'pending' : 'muted'} /></td>
                      <td><Link to={`/equipment`} className="btn btn-secondary btn-sm">View <ArrowRight size={13} /></Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {recs.length > 0 && recs[0].explanation && (
            <div className="mt-16">
              <h4 className="text-sm" style={{ marginBottom: 6 }}>Why these results?</h4>
              <p className="text-sm text-muted">{recs[0].explanation}</p>
              {recs[0].matched_terms?.length > 0 && (
                <p className="text-sm mt-16">Matched terms: {recs[0].matched_terms.join(', ')}</p>
              )}
            </div>
          )}
          {result.disclaimer && <p className="ai-disclaimer mt-16">{result.disclaimer}</p>}
          {result.warnings?.length > 0 && result.warnings.map((w, i) => <p key={i} className="text-sm mt-16" style={{ color: 'var(--warning)' }}>⚠ {w}</p>)}
        </div>
      )}

      {!loading && !searched && (
        <EmptyState icon={Sparkles} title="Get personalized recommendations" message="Enter your experiment requirement above to see AI-ranked equipment alternatives." />
      )}
    </div>
  )
}
