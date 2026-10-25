  async function getAITutorHelp(card){
    const btn=document.getElementById('ai-tutor-btn'),box=document.getElementById('ai-tutor-response'),saveBox=document.getElementById('ai-tutor-save');
    if(!btn||!box)return;
    if(card.aiAnalysis&&String(card.aiAnalysis).trim()){showAIAnalysis(card);return;}
    box.classList.remove('hidden');
    saveBox.classList.remove('hidden');
    try{
      await copyText(aiTutorPrompt(card));
      box.textContent='题目提示已复制。请粘贴到 ChatGPT 或 Codex 获取解析；然后将回答粘贴到下方并保存。';
    }catch(_){box.textContent='暂时无法自动复制。请手动复制题目后在 AI 对话中提问，再把解析粘贴到下方保存。';}
  }
  function showAIAnalysis(card){
    const box=document.getElementById('ai-tutor-response');
    if(window.MathJax?.typesetClear){try{MathJax.typesetClear([box]);}catch(_){}}
    box.textContent=card.aiAnalysis||'';
    box.classList.toggle('hidden',!String(card.aiAnalysis||'').trim());
    document.getElementById('ai-tutor-save').classList.add('hidden');
    document.getElementById('ai-tutor-analysis-input').value=card.aiAnalysis||'';
    document.getElementById('edit-ai-analysis-btn').classList.toggle('hidden',!String(card.aiAnalysis||'').trim());
    if(window.MathJax?.typesetPromise)MathJax.typesetPromise([box]).catch(()=>{});
  }
  function editAIAnalysis(card){
    const input=document.getElementById('ai-tutor-analysis-input');
    input.value=card.aiAnalysis||'';
    document.getElementById('ai-tutor-save').classList.remove('hidden');
    document.getElementById('edit-ai-analysis-btn').classList.add('hidden');
    document.getElementById('ai-tutor-response').classList.add('hidden');
    input.focus();
    input.scrollIntoView({block:'nearest'});
  }
  async function saveManualAIAnalysis(card){
    const input=document.getElementById('ai-tutor-analysis-input');
    const text=String(input?.value||'').trim();
    if(!text){showToast('请先粘贴 AI 助教解析');return;}
    const button=document.getElementById('save-ai-analysis-btn');
    if(button.disabled)return;
    button.disabled=true;
    try{
      await persistAIAnalysis(card,text);
      showToast('AI 助教解析已保存');
      if(currentQuizData[currentCardIndex]===card)renderBack(card,userProgress[currentCardIndex]?.status==='correct');
    }catch(error){showToast('保存失败：'+error.message,5000);}
    finally{button.disabled=false;}
  }

