import { useState, useRef } from 'react'
import './App.css'

// Initialize speech synthesis
const synth = window.speechSynthesis

const API_BASE_URL = 'http://127.0.0.1:5000'

const MODES = {
  PARAGRAPH: 'Paragraph',
  BULLET_POINTS: 'Bullet Points',
  CUSTOM: 'Custom'
}

function App() {
  const fileInputRef = useRef(null)
  const [text, setText] = useState('')
  const [summaryLength, setSummaryLength] = useState(30)
  const [summary, setSummary] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [uploadedText, setUploadedText] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [checkingPlagiarism, setCheckingPlagiarism] = useState(false)
  const [plagiarismResult, setPlagiarismResult] = useState(null)
  const [mode, setMode] = useState(MODES.PARAGRAPH)
  const [wordCount, setWordCount] = useState(0)
  const [isSpeaking, setIsSpeaking] = useState(false)

  const handleFileUpload = async (file) => {
    if (!file) return

    const formData = new FormData()
    formData.append('file', file)
    formData.append('summary_length', summaryLength / 100)

    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`${API_BASE_URL}/api/upload`, {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to process file')
      }

      setUploadedText(data.original_text)
      setText(data.original_text)
      setSummary(data.summary)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    handleFileUpload(file)
  }

  const handleSummarize = async () => {
    if (!text.trim()) {
      setError('Please enter some text to summarize')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`${API_BASE_URL}/api/summarize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          summary_length: summaryLength / 100,
          format_type: mode.toLowerCase()
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to summarize text')
      }

      setSummary(data.summary)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleCheckPlagiarism = async () => {
    if (!text.trim()) {
      setError('Please enter some text to check for plagiarism')
      return
    }

    setCheckingPlagiarism(true)
    setError(null)
    setPlagiarismResult(null)

    try {
      const response = await fetch(`${API_BASE_URL}/api/check-plagiarism`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to check plagiarism')
      }

      setPlagiarismResult(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setCheckingPlagiarism(false)
    }
  }

  const handleTextChange = (e) => {
    const newText = e.target.value
    setText(newText)
    setWordCount(newText.trim().split(/\s+/).length)
  }

  const handleSpeak = () => {
    if (isSpeaking) {
      synth.cancel()
      setIsSpeaking(false)
      return
    }

    if (summary.trim()) {
      setIsSpeaking(true)
      const utterance = new SpeechSynthesisUtterance(summary)
      utterance.onend = () => setIsSpeaking(false)
      synth.speak(utterance)
    } else {
      setError('No summary to read')
    }
  }

  return (
    <div className="container">
      <div className="two-column-layout">
        <div className="input-column">
          <div className="input-wrapper">
            <div 
              className={`text-input-container ${isDragging ? 'dragging' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
  
              <textarea
                value={text}
                onChange={handleTextChange}
                placeholder="Enter or paste your text here..."
                className="text-input"
              />
              <div className="word-count">{wordCount} words</div>
            </div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => handleFileUpload(e.target.files[0])}
              style={{ display: 'none' }}
              accept=".txt,.doc,.docx,.pdf"
            />
          </div>
        </div>
        
        <div className="output-column">
          <div className="summary-wrapper">
            <div className="summary-controls">
              <button
                className="format-btn"
                onClick={() => setMode(mode === MODES.PARAGRAPH ? MODES.BULLET_POINTS : MODES.PARAGRAPH)}
              >
                {mode === MODES.PARAGRAPH ? 'Convert to Bullets' : 'Convert to Paragraph'}
              </button>
              <button
                className="plagiarism-btn"
                onClick={handleCheckPlagiarism}
                disabled={checkingPlagiarism || !summary.trim()}
              >
                {checkingPlagiarism ? 'Checking...' : 'Check Plagiarism'}
              </button>
              <button
                className="voice-bot-btn"
                onClick={handleSpeak}
                disabled={!summary.trim()}
              >
                {isSpeaking ? 'Stop Speaking' : 'Read Summary'}
              </button>
            </div>
            <textarea
              value={summary}
              readOnly
              className="summary-text"
              placeholder="Summary will appear here..."
            />
            {plagiarismResult && (
              <div className="plagiarism-results">
                <h3>Plagiarism Results</h3>
                <p>Similarity Score: {plagiarismResult.similarity_score}%</p>
                {plagiarismResult.matches && plagiarismResult.matches.length > 0 && (
                  <div className="matches-list">
                    <h4>Similar Sources:</h4>
                    <ul>
                      {plagiarismResult.matches.map((match, index) => (
                        <li key={index}>
                          <a href={match.url} target="_blank" rel="noopener noreferrer">
                            {match.title || match.url}
                          </a>
                          <span className="match-score">{match.similarity}% match</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      
      <div className="summary-length">
        <span>Summary Length:</span>
        <div className="slider-wrapper">
          <span>Short</span>
          <input
            type="range"
            min="10"
            max="50"
            value={summaryLength}
            onChange={(e) => setSummaryLength(Number(e.target.value))}
            className="slider"
          />
          <span>Long</span>
        </div>
      </div>

      {error && <div className="error">{error}</div>}
      
      <div className="main-actions">
        <button 
          className="upload-doc-button"
          onClick={() => fileInputRef.current.click()}
        >
          Upload Document
        </button>
        <button
          onClick={handleSummarize}
          disabled={loading || !text.trim()}
          className="summarize-btn"
        >
          {loading ? 'Summarizing...' : 'Summarize'}
        </button>
      </div>
    </div>
  )
}

export default App
