export function clozeExample(example:string,answer:string):string {
  if(!answer.trim())return example;
  const pattern=new RegExp(answer.trim().replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'giu');
  return example.replace(pattern,(match:string,offset:number)=>{
    const before=example.slice(0,offset),after=example.slice(offset+match.length);
    if(/[\p{L}\p{M}\p{N}]$/u.test(before)&&/^[\p{L}\p{M}\p{N}]/u.test(match) || /[\p{L}\p{M}\p{N}]$/u.test(match)&&/^[\p{L}\p{M}\p{N}]/u.test(after))return match;
    return '[…]';
  });
}
