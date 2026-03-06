# Push su GitHub

La repo è pronta in locale (commit fatto). Per pubblicarla su GitHub:

## 1. Crea la repo su GitHub

**Opzione A – Da browser**  
- Vai su https://github.com/new  
- Repository name: **noaway**  
- Owner: **scudobravo**  
- Public, **non** inizializzare con README (esiste già in locale)  
- Clicca **Create repository**

**Opzione B – Da terminale (se hai già fatto `gh auth login`)**  
```bash
gh repo create scudobravo/noaway --public --source=. --remote=origin --push --description "NoAway desktop app (Electron) + license server"
```  
Se il remote `origin` è già impostato, puoi fare solo il push:
```bash
git push -u origin main
```

## 2. Push

Se hai creato la repo dal browser, dalla cartella del progetto:

```bash
cd /Users/scudobravo/Websites/SAVEMYASS
git remote add origin https://github.com/scudobravo/noaway.git
git push -u origin main
```

Se chiede credenziali, usa un Personal Access Token (Settings → Developer settings → Personal access tokens) al posto della password.
