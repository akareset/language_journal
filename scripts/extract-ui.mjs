import ts from 'typescript'; import fs from 'node:fs';
const strings=new Set();
for(const file of fs.readdirSync('src').filter(f=>f.endsWith('.tsx'))){
 const sf=ts.createSourceFile(file,fs.readFileSync('src/'+file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 function visit(n){if(ts.isJsxText(n)&&n.text.trim()) strings.add(n.text.trim());if(ts.isStringLiteral(n)&&n.parent&&ts.isJsxAttribute(n.parent)&&['title','placeholder','aria-label'].includes(n.parent.name.text))strings.add(n.text);ts.forEachChild(n,visit);} visit(sf);
} console.log(JSON.stringify([...strings],null,2));
