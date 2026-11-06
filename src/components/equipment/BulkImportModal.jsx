import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'react-toastify'
import { X, Plus, Trash2, Upload, Download, FileSpreadsheet } from 'lucide-react'
import { laboratoryService, equipmentService } from '../../services/equipmentService'

const MAX_QTY = 1000000
const blankRow = () => ({
  name: '', inventoryCode: '', category: '', totalQuantity: '', laboratory: '',
  block: '', roomNumber: '', shelfLocation: '', condition: 'working', status: 'active', description: '',
})

const validateRow = (r, i, labs, codes) => {
  const errors = []
  if (!r.name.trim()) errors.push('name required')
  if (!r.category.trim()) errors.push('category required')
  if (!r.laboratory) errors.push('laboratory required')
  const q = Number(r.totalQuantity)
  if (!Number.isInteger(q) || q < 1 || q > MAX_QTY) errors.push(`qty 1–${MAX_QTY}`)
  if (r.inventoryCode.trim() && codes.has(r.inventoryCode.trim().toLowerCase())) errors.push('duplicate code')
  if (r.laboratory && !labs.some((l) => l._id === r.laboratory)) errors.push('invalid lab')
  return errors
}

const CSV_TEMPLATE = 'name,inventory_code,category,total_quantity,laboratory_name,block,room_number,shelf_location,condition,status,description\nArduino Uno,ARD-UNO-001,Embedded Systems,100,Electronics Laboratory,Block E,E-204,Rack 1,working,active,Microcontroller board\n'

export default function BulkImportModal({ onClose, onSaved }) {
  const [mode, setMode] = useState('table') // table | csv
  const [labs, setLabs] = useState([])
  const [rows, setRows] = useState([blankRow(), blankRow()])
  const [csvRows, setCsvRows] = useState([])
  const [csvName, setCsvName] = useState('')
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState(null)
  const fileRef = useRef(null)

  useEffect(() => {
    laboratoryService.getAll().then(setLabs).catch(() => toast.error('Failed to load laboratories'))
  }, [])

  const labNameToId = useMemo(() => {
    const m = {}
    labs.forEach((l) => { m[l.name.toLowerCase()] = l._id; m[`${l.building} ${l.roomNumber}`.toLowerCase()] = l._id })
    return m
  }, [labs])

  const updateRow = (i, k, v) => {
    const next = [...rows]; next[i] = { ...next[i], [k]: v }; setRows(next); setResult(null)
  }

  const parseCSV = (text) => {
    const lines = text.split(/\r?\n/).filter((l) => l.trim())
    if (lines.length < 2) { toast.error('CSV needs a header row and at least one data row'); return }
    const header = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'))
    const idx = (names) => header.findIndex((h) => names.includes(h))
    const cols = {
      name: idx(['name', 'equipment_name']),
      code: idx(['inventory_code', 'inventorycode', 'code']),
      category: idx(['category']),
      qty: idx(['total_quantity', 'quantity', 'qty']),
      lab: idx(['laboratory_name', 'laboratory', 'lab']),
      block: idx(['block']),
      room: idx(['room_number', 'room']),
      shelf: idx(['shelf_location', 'shelf', 'location']),
      condition: idx(['condition']),
      status: idx(['status']),
      desc: idx(['description']),
    }
    const parsed = []
    for (let i = 1; i < lines.length; i++) {
      // simple CSV split (handles quoted fields minimally)
      const cells = lines[i].match(/("([^"]|"")*"|[^,]*)/g)?.map((c) => c.replace(/^"|"$/g, '').replace(/""/g, '"').trim()) || []
      const get = (c) => (c >= 0 ? cells[c] || '' : '')
      const labName = get(cols.lab)
      parsed.push({
        _i: i,
        name: get(cols.name),
        inventoryCode: get(cols.code),
        category: get(cols.category),
        totalQuantity: get(cols.qty),
        laboratoryName: labName,
        laboratory: labNameToId[labName.toLowerCase()] || '',
        block: get(cols.block),
        roomNumber: get(cols.room),
        shelfLocation: get(cols.shelf),
        condition: get(cols.condition) || 'working',
        status: get(cols.status) || 'active',
        description: get(cols.desc),
      })
    }
    setCsvRows(parsed)
  }

  const onFile = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    setCsvName(f.name)
    const reader = new FileReader()
    reader.onload = () => parseCSV(String(reader.result))
    reader.readAsText(f)
    e.target.value = ''
  }

  const downloadTemplate = () => {
    const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob); a.download = 'labmate_equipment_template.csv'; a.click()
  }

  // Validation summaries
  const tableCodes = useMemo(() => {
    const s = new Set()
    rows.forEach((r) => { if (r.inventoryCode.trim()) s.add(r.inventoryCode.trim().toLowerCase()) })
    return s
  }, [rows])

  const tableValidation = useMemo(() => rows.map((r, i) => ({ row: i + 1, errors: validateRow(r, i, labs, new Set()) })), [rows, labs])
  const csvValidation = useMemo(() => csvRows.map((r) => ({ row: r._i, errors: validateRow(r, r._i, labs, new Set(csvRows.filter((x) => x.inventoryCode).map((x) => x.inventoryCode.toLowerCase())) ) })), [csvRows, labs])

  const validTableRows = tableValidation.filter((v) => !v.errors.length).length
  const validCsvRows = csvValidation.filter((v) => !v.errors.length).length

  const payloadFromRows = (list) => list.map((r) => ({
    name: r.name.trim(),
    inventoryCode: r.inventoryCode?.trim() || '',
    category: r.category.trim(),
    model: r.model || '',
    totalQuantity: Number(r.totalQuantity),
    laboratory: r.laboratory,
    block: r.block || '',
    roomNumber: r.roomNumber || '',
    shelfLocation: r.shelfLocation || '',
    condition: r.condition || 'working',
    status: r.status || 'active',
    description: r.description || '',
  }))

  const doImport = async () => {
    const source = mode === 'table'
      ? rows.filter((_, i) => !tableValidation[i].errors.length)
      : csvRows.filter((_, i) => !csvValidation[i].errors.length)
    if (!source.length) { toast.error('No valid rows to import'); return }
    setImporting(true); setResult(null)
    try {
      const res = await equipmentService.bulkImport(payloadFromRows(source))
      setResult(res)
      toast.success(res.data.message)
      if (res.data.created > 0) onSaved()
    } catch (e) {
      toast.error(e.response?.data?.message || 'Import failed')
    } finally { setImporting(false) }
  }

  const inputStyle = { padding: '6px 8px', fontSize: 12.5, width: '100%' }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 980 }}>
        <div className="flex-between mb-16">
          <h3>Bulk Add Equipment</h3>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="tabs">
          <button className={`tab-btn ${mode === 'table' ? 'active' : ''}`} onClick={() => setMode('table')}>Table Entry</button>
          <button className={`tab-btn ${mode === 'csv' ? 'active' : ''}`} onClick={() => setMode('csv')}>CSV Upload</button>
        </div>

        {mode === 'table' && (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ fontSize: 12.5 }}>
              <thead>
                <tr>
                  <th>Name *</th><th>Inv. Code</th><th>Category *</th><th>Qty *</th><th>Lab *</th>
                  <th>Block</th><th>Room</th><th>Shelf</th><th>Cond.</th><th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} style={tableValidation[i].errors.length ? { background: '#fef2f2' } : {}}>
                    <td><input style={inputStyle} value={r.name} onChange={(e) => updateRow(i, 'name', e.target.value)} placeholder="Equipment name" /></td>
                    <td><input style={inputStyle} value={r.inventoryCode} onChange={(e) => updateRow(i, 'inventoryCode', e.target.value)} /></td>
                    <td><input style={inputStyle} value={r.category} onChange={(e) => updateRow(i, 'category', e.target.value)} /></td>
                    <td><input style={{ ...inputStyle, width: 80 }} type="number" min="1" max={MAX_QTY} value={r.totalQuantity} onChange={(e) => updateRow(i, 'totalQuantity', e.target.value)} /></td>
                    <td>
                      <select style={inputStyle} value={r.laboratory} onChange={(e) => updateRow(i, 'laboratory', e.target.value)}>
                        <option value="">Select…</option>
                        {labs.map((l) => <option key={l._id} value={l._id}>{l.name}</option>)}
                      </select>
                    </td>
                    <td><input style={inputStyle} value={r.block} onChange={(e) => updateRow(i, 'block', e.target.value)} /></td>
                    <td><input style={{ ...inputStyle, width: 70 }} value={r.roomNumber} onChange={(e) => updateRow(i, 'roomNumber', e.target.value)} /></td>
                    <td><input style={inputStyle} value={r.shelfLocation} onChange={(e) => updateRow(i, 'shelfLocation', e.target.value)} /></td>
                    <td>
                      <select style={inputStyle} value={r.condition} onChange={(e) => updateRow(i, 'condition', e.target.value)}>
                        <option value="working">working</option><option value="damaged">damaged</option><option value="under_maintenance">maint.</option>
                      </select>
                    </td>
                    <td>
                      <button className="icon-btn" onClick={() => { setRows(rows.filter((_, j) => j !== i)) }}><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {tableValidation.some((v) => v.errors.length) && (
              <div className="mt-16">
                {tableValidation.filter((v) => v.errors.length).map((v) => (
                  <p key={v.row} className="form-error">Row {v.row}: {v.errors.join(', ')}</p>
                ))}
              </div>
            )}
            <div className="flex mt-16">
              <button className="btn btn-secondary btn-sm" onClick={() => setRows([...rows, blankRow()])}><Plus size={15} /> Add Row</button>
              <span className="text-sm text-muted" style={{ alignSelf: 'center' }}>{validTableRows}/{rows.length} valid rows</span>
            </div>
          </div>
        )}

        {mode === 'csv' && (
          <div>
            <div className="flex mb-16" style={{ gap: 10 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()}><Upload size={15} /> Choose CSV File</button>
              <button className="btn btn-secondary btn-sm" onClick={downloadTemplate}><Download size={15} /> Download Template</button>
              <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={onFile} />
              {csvName && <span className="text-sm text-muted" style={{ alignSelf: 'center' }}><FileSpreadsheet size={14} /> {csvName}</span>}
            </div>
            <p className="text-sm text-muted mb-16">
              Columns: name, inventory_code, category, total_quantity, laboratory_name, block, room_number, shelf_location, condition, status, description.
              Laboratory name must match an existing laboratory (e.g. "Electronics Laboratory").
            </p>
            {csvRows.length > 0 && (
              <div style={{ overflowX: 'auto', maxHeight: 320, overflowY: 'auto' }}>
                <table className="data-table" style={{ fontSize: 12.5 }}>
                  <thead><tr><th>Row</th><th>Name</th><th>Code</th><th>Qty</th><th>Lab</th><th>Block</th><th>Errors</th></tr></thead>
                  <tbody>
                    {csvRows.map((r, i) => (
                      <tr key={i} style={csvValidation[i]?.errors.length ? { background: '#fef2f2' } : {}}>
                        <td>{r._i}</td><td>{r.name}</td><td>{r.inventoryCode}</td><td>{r.totalQuantity}</td>
                        <td>{r.laboratoryName || '—'}</td><td>{r.block || '—'}</td>
                        <td className="text-sm" style={{ color: 'var(--danger)' }}>{csvValidation[i]?.errors.join(', ') || '✓'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-sm text-muted mt-16">{validCsvRows}/{csvRows.length} valid rows</p>
              </div>
            )}
          </div>
        )}

        {result && (
          <div className="availability-box availability-info mt-16">
            <strong>Import report:</strong> {result.created} created, {result.failed} failed.
            {result.results?.filter((r) => r.status === 'failed').slice(0, 8).map((r) => (
              <p key={r.row} className="text-sm" style={{ marginTop: 4 }}>Row {r.row} ({r.name}): {r.errors.join(', ')}</p>
            ))}
          </div>
        )}

        <div className="flex mt-16" style={{ justifyContent: 'flex-end', gap: 10 }}>
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
          <button className="btn btn-teal" onClick={doImport} disabled={importing || (mode === 'table' ? validTableRows === 0 : validCsvRows === 0)}>
            {importing ? 'Importing…' : `Import ${mode === 'table' ? validTableRows : validCsvRows} valid row(s)`}
          </button>
        </div>
      </div>
    </div>
  )
}
