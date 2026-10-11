'use strict';
// Minimal, dependency-free .xlsx writer: SpreadsheetML parts packed in an uncompressed (stored) ZIP.
// Used by the Stock Monitor Excel export. Runs under a script-src 'self' policy (no external libraries).
window.XlsxWriter=(()=>{
const enc=new TextEncoder();
const crcTable=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
function crc32(bytes){let c=0xFFFFFFFF;for(let i=0;i<bytes.length;i++)c=crcTable[(c^bytes[i])&255]^(c>>>8);return (c^0xFFFFFFFF)>>>0;}
function zip(parts){
const now=new Date();
const dosTime=(now.getHours()<<11)|(now.getMinutes()<<5)|(now.getSeconds()>>1);
const dosDate=((now.getFullYear()-1980)<<9)|((now.getMonth()+1)<<5)|now.getDate();
const files=parts.map(p=>{const name=enc.encode(p.name),data=enc.encode(p.text);return {name,data,crc:crc32(data)};});
let size=22;for(const f of files)size+=30+f.name.length+f.data.length+46+f.name.length;
const out=new Uint8Array(size),view=new DataView(out.buffer);let pos=0;const offsets=[];
const u16=v=>{view.setUint16(pos,v,true);pos+=2;},u32=v=>{view.setUint32(pos,v,true);pos+=4;},bytes=b=>{out.set(b,pos);pos+=b.length;};
for(const f of files){
offsets.push(pos);
u32(0x04034b50);u16(20);u16(0x0800);u16(0);u16(dosTime);u16(dosDate);u32(f.crc);u32(f.data.length);u32(f.data.length);u16(f.name.length);u16(0);bytes(f.name);bytes(f.data);
}
const centralStart=pos;
files.forEach((f,i)=>{
u32(0x02014b50);u16(20);u16(20);u16(0x0800);u16(0);u16(dosTime);u16(dosDate);u32(f.crc);u32(f.data.length);u32(f.data.length);u16(f.name.length);u16(0);u16(0);u16(0);u16(0);u32(0);u32(offsets[i]);bytes(f.name);
});
const centralSize=pos-centralStart;
u32(0x06054b50);u16(0);u16(0);u16(files.length);u16(files.length);u32(centralSize);u32(centralStart);u16(0);
return out;
}
const esc=s=>String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const colName=i=>{let s='';i++;while(i>0){const m=(i-1)%26;s=String.fromCharCode(65+m)+s;i=Math.floor((i-1)/26);}return s;};
const STYLE={header:1,text:2,num:3,pct:4,int:5};
const finite=v=>typeof v==='number'&&Number.isFinite(v);
function cellXml(ref,cell){
const s=STYLE[cell.style]??STYLE.text;
if(cell.formula!==undefined)return '<c r="'+ref+'" s="'+s+'"><f>'+esc(cell.formula)+'</f>'+(finite(cell.value)?'<v>'+cell.value+'</v>':'')+'</c>';
if(finite(cell.value))return '<c r="'+ref+'" s="'+s+'"><v>'+cell.value+'</v></c>';
if(cell.value===undefined||cell.value===null||cell.value==='')return '<c r="'+ref+'" s="'+s+'"/>';
return '<c r="'+ref+'" s="'+s+'" t="inlineStr"><is><t xml:space="preserve">'+esc(cell.value)+'</t></is></c>';
}
function build({sheetName='Sheet1',columns,rows}){
const head=columns.map((c,i)=>cellXml(colName(i)+'1',{value:c.header,style:'header'})).join('');
const body=rows.map((row,r)=>'<row r="'+(r+2)+'">'+row.map((cell,i)=>cellXml(colName(i)+(r+2),cell)).join('')+'</row>').join('');
const cols=columns.map((c,i)=>'<col min="'+(i+1)+'" max="'+(i+1)+'" width="'+(c.width||14)+'" customWidth="1"/>').join('');
const main='http://schemas.openxmlformats.org/spreadsheetml/2006/main',rel='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const xml='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const parts=[
{name:'[Content_Types].xml',text:xml+'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'},
{name:'_rels/.rels',text:xml+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="'+rel+'/officeDocument" Target="xl/workbook.xml"/></Relationships>'},
{name:'xl/workbook.xml',text:xml+'<workbook xmlns="'+main+'" xmlns:r="'+rel+'"><sheets><sheet name="'+esc(sheetName)+'" sheetId="1" r:id="rId1"/></sheets><calcPr fullCalcOnLoad="1"/></workbook>'},
{name:'xl/_rels/workbook.xml.rels',text:xml+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="'+rel+'/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="'+rel+'/styles" Target="styles.xml"/></Relationships>'},
{name:'xl/styles.xml',text:xml+'<styleSheet xmlns="'+main+'"><fonts count="2"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="11"/><name val="Arial"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEAF3FF"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FF999999"/></left><right style="thin"><color rgb="FF999999"/></right><top style="thin"><color rgb="FF999999"/></top><bottom style="thin"><color rgb="FF999999"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/><xf numFmtId="10" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/><xf numFmtId="1" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'},
{name:'xl/worksheets/sheet1.xml',text:xml+'<worksheet xmlns="'+main+'"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>'+cols+'</cols><sheetData><row r="1" ht="32" customHeight="1">'+head+'</row>'+body+'</sheetData></worksheet>'}
];
return new Blob([zip(parts)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
return {build};
})();
