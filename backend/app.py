from flask import Flask, request, jsonify
from flask_cors import CORS
import nltk
from nltk.corpus import stopwords
from nltk.tokenize import sent_tokenize, word_tokenize
from nltk.probability import FreqDist
from string import punctuation
import os
from werkzeug.utils import secure_filename
import docx
from PyPDF2 import PdfReader
import requests
from bs4 import BeautifulSoup
from difflib import SequenceMatcher
from urllib.parse import urlparse

UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'txt', 'pdf', 'doc', 'docx'}

if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

# Download required NLTK data
nltk.download('punkt')
nltk.download('stopwords')

app = Flask(__name__)
CORS(app)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size

@app.route('/')
def health_check():
    return jsonify({'status': 'healthy'})

@app.route('/api/check-plagiarism', methods=['POST'])
def check_plagiarism():
    data = request.get_json()
    text = data.get('text')
    
    if not text:
        return jsonify({'error': 'No text provided'}), 400
    
    try:
        # Initialize results
        matches = []
        max_similarity = 0
        
        # Search for similar content using a search engine API
        # For demonstration, we'll use a simple direct comparison with some example sources
        example_sources = [
            {
                'url': 'https://example.com/article1',
                'title': 'Example Article 1',
                'content': 'This is a sample article content for comparison.'
            },
            {
                'url': 'https://example.com/article2',
                'title': 'Example Article 2',
                'content': 'Another example article with different content.'
            }
        ]
        
        # Compare text with each source
        for source in example_sources:
            similarity = SequenceMatcher(None, text.lower(), source['content'].lower()).ratio() * 100
            if similarity > 20:  # Only include matches with >20% similarity
                matches.append({
                    'url': source['url'],
                    'title': source['title'],
                    'similarity': round(similarity, 1)
                })
                max_similarity = max(max_similarity, similarity)
        
        return jsonify({
            'similarity_score': round(max_similarity, 1),
            'matches': sorted(matches, key=lambda x: x['similarity'], reverse=True)
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

def preprocess_text(text):
    # Tokenize the text into sentences
    sentences = sent_tokenize(text)
    
    # Tokenize words, convert to lowercase, remove stopwords and punctuation
    stop_words = set(stopwords.words('english') + list(punctuation))
    words = word_tokenize(text.lower())
    words = [word for word in words if word not in stop_words]
    
    return sentences, words

def get_summary(text, summary_length=0.3, format_type='paragraph'):
    if not text:
        return ''
    
    # Preprocess the text
    sentences, words = preprocess_text(text)
    
    # Calculate word frequency
    freq_dist = FreqDist(words)
    
    # Calculate sentence scores based on word frequency
    sentence_scores = {}
    for sentence in sentences:
        for word in word_tokenize(sentence.lower()):
            if word in freq_dist:
                if sentence not in sentence_scores:
                    sentence_scores[sentence] = freq_dist[word]
                else:
                    sentence_scores[sentence] += freq_dist[word]
    
    # Get the summary length (number of sentences)
    summary_sentences_count = max(1, int(len(sentences) * summary_length))
    
    # Get top scoring sentences
    summary_sentences = sorted(sentence_scores.items(), 
                             key=lambda x: x[1], 
                             reverse=True)[:summary_sentences_count]
    
    # Sort sentences by their original order
    summary_sentences.sort(key=lambda x: sentences.index(x[0]))
    
    # Format the summary based on format_type
    if format_type == 'bullets':
        summary = '\n• ' + '\n• '.join([sentence[0].strip() for sentence in summary_sentences])
    else:  # paragraph format
        summary = ' '.join([sentence[0] for sentence in summary_sentences])
    
    return summary

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def extract_text_from_file(file_path):
    file_extension = file_path.rsplit('.', 1)[1].lower()
    
    if file_extension == 'txt':
        with open(file_path, 'r', encoding='utf-8') as file:
            return file.read()
    
    elif file_extension == 'pdf':
        text = ''
        with open(file_path, 'rb') as file:
            pdf_reader = PdfReader(file)
            for page in pdf_reader.pages:
                text += page.extract_text()
        return text
    
    elif file_extension in ['doc', 'docx']:
        doc = docx.Document(file_path)
        return ' '.join([paragraph.text for paragraph in doc.paragraphs])
    
    return ''

@app.route('/api/upload', methods=['POST'])
def upload_file():
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file part'}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'No selected file'}), 400
        
        if not allowed_file(file.filename):
            return jsonify({'error': 'File type not allowed'}), 400
        
        filename = secure_filename(file.filename)
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(file_path)
        
        text = extract_text_from_file(file_path)
        os.remove(file_path)  # Clean up after extraction
        
        if not text:
            return jsonify({'error': 'Could not extract text from file'}), 400
        
        summary_length = float(request.form.get('summary_length', 0.3))
        summary = get_summary(text, summary_length)
        
        return jsonify({
            'summary': summary,
            'original_text': text,
            'original_length': len(text.split()),
            'summary_length': len(summary.split())
        })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/summarize', methods=['POST'])
def summarize():
    try:
        data = request.get_json()
        text = data.get('text', '')
        summary_length = data.get('summary_length', 0.3)
        format_type = data.get('format_type', 'paragraph')
        
        if not text:
            return jsonify({'error': 'No text provided'}), 400
        
        summary = get_summary(text, summary_length, format_type)
        return jsonify({
            'summary': summary,
            'original_length': len(text.split()),
            'summary_length': len(summary.split())
        })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    try:
        print('Starting Flask server...')
        app.run(port=5000, debug=True)
    except Exception as e:
        print(f'Error starting server: {e}')