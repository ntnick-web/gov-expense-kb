import json

input_file = "05_scripts/_llm_review_proposals/inputs/batch_01.jsonl"
output_file = "05_scripts/_llm_review_proposals/outputs/batch_01.jsonl"

records = []
with open(input_file, 'r', encoding='utf-8') as f:
    for line in f:
        if line.strip():
            records.append(json.loads(line))

verdicts = []

for record in records:
    record_id = record['id']
    current_summary = record.get('current_summary', '').strip()
    body_excerpt = record.get('body_excerpt', '').strip()
    category = record.get('category', '')
    
    # For B-class (support standards/tables)
    if category == 'B':
        verdict = {
            'id': record_id,
            'verdict': 'flag',
            'reason': '本紀錄為費率標準表,body 為表格內容,current_summary 為表格資料而非摘要'
        }
        verdicts.append(verdict)
        continue
    
    # For D-class (Q&A) - analyze structure
    q_idx = body_excerpt.find('【問題】')
    a_idx = body_excerpt.find('【回答】')
    
    if q_idx < 0 or a_idx < 0:
        verdict = {
            'id': record_id,
            'verdict': 'flag',
            'reason': 'body 缺少【問題】或【回答】標記,無法判斷'
        }
        verdicts.append(verdict)
        continue
    
    question_text = body_excerpt[q_idx + 4:a_idx].strip()
    answer_text = body_excerpt[a_idx + 4:].strip()
    
    # Normalize for comparison
    def normalize(text):
        return text.replace('？', '').replace('?', '').replace('、', '').replace('\n', '')
    
    q_norm = normalize(question_text)
    s_norm = normalize(current_summary)
    
    # Check if summary is the question text (verbatim or very similar)
    is_question = (s_norm in q_norm or q_norm[:min(30, len(q_norm))] in s_norm)
    
    if is_question or current_summary.rstrip('?？') == question_text.rstrip('?？').rstrip():
        # Summary is question - fix needed
        # Extract key answer point
        answer_lines = answer_text.split('\n')
        key_answer = ""
        for line in answer_lines:
            if line.strip() and not line.startswith('則問題') and not line.startswith('題'):
                key_answer = line.strip()
                break
        
        if not key_answer:
            key_answer = answer_lines[0] if answer_lines else "答覆內容待補"
        
        # Trim to 30-80 chars and add period
        key_answer = key_answer[:80]
        if not key_answer.endswith('。'):
            key_answer = key_answer + '。' if key_answer else "本題答覆如上。"
        
        verdict = {
            'id': record_id,
            'verdict': 'fix',
            'new_summary': key_answer,
            'reason': 'current_summary 為問題文本,應改為答覆重點'
        }
    elif len(current_summary) > 0:
        # Has summary - check if it looks like answer content
        if '依' in current_summary or '本會' in current_summary or '規定' in current_summary:
            verdict = {
                'id': record_id,
                'verdict': 'pass',
                'reason': '摘要涵蓋回答重點'
            }
        else:
            # Unclear - might still be question
            verdict = {
                'id': record_id,
                'verdict': 'fix',
                'new_summary': answer_text.split('。')[0][:80] + '。',
                'reason': '摘要文本來源不清,以回答首句重新撰寫'
            }
    else:
        verdict = {
            'id': record_id,
            'verdict': 'flag',
            'reason': 'current_summary 為空'
        }
    
    verdicts.append(verdict)

# Write output JSONL
with open(output_file, 'w', encoding='utf-8') as f:
    for v in verdicts:
        f.write(json.dumps(v, ensure_ascii=False) + '\n')

print(f"Successfully processed {len(verdicts)} records")
print(f"Output: {output_file}")

# Summary
pass_count = len([v for v in verdicts if v['verdict'] == 'pass'])
fix_count = len([v for v in verdicts if v['verdict'] == 'fix'])
flag_count = len([v for v in verdicts if v['verdict'] == 'flag'])
print(f"pass: {pass_count}, fix: {fix_count}, flag: {flag_count}")
