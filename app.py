"""
Flask Application for Microgravity Plant Growth Simulator
Educational STEM Project
"""

from flask import Flask, render_template

app = Flask(__name__)

@app.route('/')
def home():
    """Main page - Interactive clinostat simulation"""
    return render_template('index.html')

if __name__ == '__main__':
    app.run(debug=True)