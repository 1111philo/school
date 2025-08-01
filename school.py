import streamlit as st
import os
from openai import OpenAI

# --- Configuration ---
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# --- LLM Functions ---

def generate_false_statement(topic="U.S. history"):
    system_prompt = "You are an educational assistant who writes short statements with subtle factual errors to challenge students."
    user_prompt = f"Write a short statement about {topic} with one subtle factual error. Make it age-appropriate for an 8th-grade student."

    response = client.chat.completions.create(
        model="gpt-4",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ]
    )
    return response.choices[0].message.content.strip()

def assess_response(statement, student_input):
    system_prompt = "You are a teacher grading a student’s response to a factual error in a statement."
    user_prompt = (
        f"Original statement: \"{statement}\"\n\n"
        f"Student response: \"{student_input}\"\n\n"
        f"Did the student identify the error? Score them 0 (wrong), 1 (partially correct), or 2 (fully correct). "
        f"Then briefly explain the reasoning."
    )

    response = client.chat.completions.create(
        model="gpt-4",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ]
    )
    return response.choices[0].message.content.strip()

# --- Streamlit UI ---
st.title("🧠 Spot the Mistake!")
st.write("Can you identify the error in this educational statement?")

if "statement" not in st.session_state:
    st.session_state.statement = generate_false_statement()

st.markdown(f"### Challenge Statement:\n> {st.session_state.statement}")

student_input = st.text_area("📝 What do you think is wrong with this statement?", height=150)

if st.button("Submit"):
    if not student_input.strip():
        st.warning("Please enter a response.")
    else:
        with st.spinner("Evaluating your response..."):
            feedback = assess_response(st.session_state.statement, student_input)
            st.success("Here's your feedback:")
            st.markdown(f"---\n{feedback}\n---")

if st.button("New Statement"):
    st.session_state.statement = generate_false_statement()
    st.experimental_rerun()