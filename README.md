


# Spot the Mistake

This is a Streamlit prototype app that helps students practice critical thinking by identifying factual errors in short educational statements.

## How It Works

1. The app generates a short statement with a subtle error.
2. The student reads the statement and types in what they think is wrong.
3. An AI model scores the response and gives feedback.

## Setup Instructions

1. Create and activate a virtual environment:
   ```
   python3 -m venv venv
   source venv/bin/activate   # On Windows: venv\Scripts\activate
   ```

2. Install requirements:
   ```
   pip install -r requirements.txt
   ```

3. Add your OpenAI API key:
   - Option 1: Set it as an environment variable
     ```
     export OPENAI_API_KEY=your_key_here
     ```
   - Option 2: Create a file `.streamlit/secrets.toml` with:
     ```
     [general]
     OPENAI_API_KEY = "your_key_here"
     ```

4. Run the app:
   ```
   streamlit run school.py
   ```

## Requirements

- Python 3.8+
- OpenAI API key