


# Spot the Mistake

This is a Streamlit prototype app that helps students practice critical thinking by identifying factual errors in short educational statements.

This prototype is hopefully the first step toward building a truly generative AI-powered school. It explores how language models can generate instructional content, prompt student analysis, and assess responses — automating core teaching loops like question generation, student engagement, and formative feedback. This foundation supports scalable, personalized learning systems.


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

## Alternative: Use Without Code

You can test this idea without running any code by pasting the following prompt into ChatGPT or another LLM:

```
You're simulating a learning assistant for critical thinking.

Step 1: Generate a short educational statement that contains a **subtle factual error**, appropriate for an 8th-grade student. Choose a subject like U.S. history, science, or geography.

Step 2: Present the statement and ask the student:  
"What do you think is wrong with this statement? Explain your reasoning."

Step 3: Wait for a student response.

Step 4: Based on the response, **evaluate** whether the student correctly identified the error. Give:
- A score out of 2 (0 = wrong, 1 = partially correct, 2 = fully correct)
- A short explanation of the evaluation

Then offer a new question if prompted.

Begin with Step 1 now.
```

## Requirements

- Python 3.8+
- OpenAI API key