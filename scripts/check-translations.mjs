import ts from 'typescript';import fs from 'node:fs';
const source=ts.createSourceFile('i18n.ts',fs.readFileSync('src/i18n.ts','utf8'),ts.ScriptTarget.Latest,true);const keys=new Set();
function dict(n){if(ts.isVariableDeclaration(n)&&n.name.getText(source)==='de'&&n.initializer&&ts.isObjectLiteralExpression(n.initializer)){for(const p of n.initializer.properties)if(p.name)keys.add(p.name.text);}ts.forEachChild(n,dict);}dict(source);
const missing=new Set();for(const file of fs.readdirSync('src').filter(f=>f.endsWith('.tsx'))){const s=ts.createSourceFile(file,fs.readFileSync('src/'+file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);function visit(n){if(ts.isCallExpression(n)&&n.expression.getText(s)==='t'&&n.arguments[0]&&ts.isStringLiteral(n.arguments[0])&&!keys.has(n.arguments[0].text))missing.add(n.arguments[0].text);ts.forEachChild(n,visit);}visit(s);}console.log([...missing]);
if (missing.size) process.exitCode = 1;
