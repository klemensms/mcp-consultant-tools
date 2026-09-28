/**
 * Minimal valid blank Word, Excel and PowerPoint files, generated in memory
 * from their XML parts. The blank Word file defines the heading and list
 * styles so spo-edit-word inserts with a style show as intended.
 */
import { zipSync, strToU8 } from 'fflate';

const DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const CT = 'http://schemas.openxmlformats.org/package/2006/content-types';
const PR = 'http://schemas.openxmlformats.org/package/2006/relationships';
const RT = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const S = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const OFFICE = 'application/vnd.openxmlformats-officedocument';

function pack(parts: Record<string, string>): Buffer {
  return Buffer.from(zipSync(Object.fromEntries(Object.entries(parts).map(([path, xml]) => [path, strToU8(DECL + xml)]))));
}

function contentTypes(overrides: Record<string, string>): string {
  return (
    `<Types xmlns="${CT}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    Object.entries(overrides).map(([part, type]) => `<Override PartName="${part}" ContentType="${OFFICE}.${type}"/>`).join('') +
    '</Types>'
  );
}

function rels(list: Array<[id: string, type: string, target: string]>): string {
  return `<Relationships xmlns="${PR}">` + list.map(([id, type, target]) => `<Relationship Id="${id}" Type="${RT}/${type}" Target="${target}"/>`).join('') + '</Relationships>';
}

const heading = (level: number, size: number) =>
  `<w:style w:type="paragraph" w:styleId="Heading${level}"><w:name w:val="heading ${level}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>` +
  `<w:pPr><w:keepNext/><w:spacing w:before="240" w:after="80"/><w:outlineLvl w:val="${level - 1}"/></w:pPr><w:rPr><w:b/><w:sz w:val="${size}"/></w:rPr></w:style>`;

export function blankDocx(): Buffer {
  return pack({
    '[Content_Types].xml': contentTypes({
      '/word/document.xml': 'wordprocessingml.document.main+xml',
      '/word/styles.xml': 'wordprocessingml.styles+xml',
      '/word/numbering.xml': 'wordprocessingml.numbering+xml',
    }),
    '_rels/.rels': rels([['rId1', 'officeDocument', 'word/document.xml']]),
    'word/_rels/document.xml.rels': rels([
      ['rId1', 'styles', 'styles.xml'],
      ['rId2', 'numbering', 'numbering.xml'],
    ]),
    'word/document.xml':
      `<w:document xmlns:w="${W}"><w:body><w:p/>` +
      '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>' +
      '</w:body></w:document>',
    'word/styles.xml':
      `<w:styles xmlns:w="${W}">` +
      '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:lang w:val="en-GB"/></w:rPr></w:rPrDefault>' +
      '<w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="259" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
      '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
      '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:rPr><w:sz w:val="56"/></w:rPr></w:style>' +
      heading(1, 32) + heading(2, 28) + heading(3, 24) +
      '<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:ind w:left="720"/></w:pPr></w:style>' +
      '<w:style w:type="paragraph" w:styleId="ListBullet"><w:name w:val="List Bullet"/><w:basedOn w:val="Normal"/><w:pPr><w:numPr><w:numId w:val="1"/></w:numPr></w:pPr></w:style>' +
      '<w:style w:type="paragraph" w:styleId="ListNumber"><w:name w:val="List Number"/><w:basedOn w:val="Normal"/><w:pPr><w:numPr><w:numId w:val="2"/></w:numPr></w:pPr></w:style>' +
      '</w:styles>',
    'word/numbering.xml':
      `<w:numbering xmlns:w="${W}">` +
      '<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum>' +
      '<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum>' +
      '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>' +
      '</w:numbering>',
  });
}

export function blankXlsx(): Buffer {
  return pack({
    '[Content_Types].xml': contentTypes({
      '/xl/workbook.xml': 'spreadsheetml.sheet.main+xml',
      '/xl/worksheets/sheet1.xml': 'spreadsheetml.worksheet+xml',
      '/xl/styles.xml': 'spreadsheetml.styles+xml',
    }),
    '_rels/.rels': rels([['rId1', 'officeDocument', 'xl/workbook.xml']]),
    'xl/_rels/workbook.xml.rels': rels([
      ['rId1', 'worksheet', 'worksheets/sheet1.xml'],
      ['rId2', 'styles', 'styles.xml'],
    ]),
    'xl/workbook.xml': `<workbook xmlns="${S}" xmlns:r="${RT}"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/worksheets/sheet1.xml': `<worksheet xmlns="${S}"><sheetData/></worksheet>`,
    'xl/styles.xml':
      `<styleSheet xmlns="${S}">` +
      '<fonts count="1"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>' +
      '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
      '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>' +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      '</styleSheet>',
  });
}

const colour = (name: string, hex: string) => `<a:${name}><a:srgbClr val="${hex}"/></a:${name}>`;
const solid = (scheme = 'phClr') => `<a:solidFill><a:schemeClr val="${scheme}"/></a:solidFill>`;
const line = (w: number) => `<a:ln w="${w}">${solid()}</a:ln>`;

const THEME =
  `<a:theme xmlns:a="${A}" name="Office Theme"><a:themeElements>` +
  '<a:clrScheme name="Office">' +
  '<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>' +
  colour('dk2', '44546A') + colour('lt2', 'E7E6E6') + colour('accent1', '4472C4') + colour('accent2', 'ED7D31') +
  colour('accent3', 'A5A5A5') + colour('accent4', 'FFC000') + colour('accent5', '5B9BD5') + colour('accent6', '70AD47') +
  colour('hlink', '0563C1') + colour('folHlink', '954F72') +
  '</a:clrScheme>' +
  '<a:fontScheme name="Office"><a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>' +
  '<a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>' +
  '<a:fmtScheme name="Office">' +
  `<a:fillStyleLst>${solid()}${solid()}${solid()}</a:fillStyleLst>` +
  `<a:lnStyleLst>${line(6350)}${line(12700)}${line(19050)}</a:lnStyleLst>` +
  '<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>' +
  `<a:bgFillStyleLst>${solid()}${solid()}${solid()}</a:bgFillStyleLst>` +
  '</a:fmtScheme></a:themeElements></a:theme>';

const NS_P = `xmlns:a="${A}" xmlns:r="${RT}" xmlns:p="${P}"`;
const GROUP = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>';

function placeholder(id: number, name: string, type: string, frame?: [number, number, number, number]): string {
  const xfrm = frame ? `<a:xfrm><a:off x="${frame[0]}" y="${frame[1]}"/><a:ext cx="${frame[2]}" cy="${frame[3]}"/></a:xfrm>` : '';
  return (
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="${type}"/></p:nvPr></p:nvSpPr>` +
    `<p:spPr>${xfrm}</p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="en-GB"/></a:p></p:txBody></p:sp>`
  );
}

const TITLE_FRAME: [number, number, number, number] = [1524000, 1122363, 9144000, 2387600];
const SUBTITLE_FRAME: [number, number, number, number] = [1524000, 3602038, 9144000, 1655762];

export function blankPptx(): Buffer {
  return pack({
    '[Content_Types].xml': contentTypes({
      '/ppt/presentation.xml': 'presentationml.presentation.main+xml',
      '/ppt/slideMasters/slideMaster1.xml': 'presentationml.slideMaster+xml',
      '/ppt/slideLayouts/slideLayout1.xml': 'presentationml.slideLayout+xml',
      '/ppt/slides/slide1.xml': 'presentationml.slide+xml',
      '/ppt/theme/theme1.xml': 'theme+xml',
    }),
    '_rels/.rels': rels([['rId1', 'officeDocument', 'ppt/presentation.xml']]),
    'ppt/_rels/presentation.xml.rels': rels([
      ['rId1', 'slideMaster', 'slideMasters/slideMaster1.xml'],
      ['rId2', 'slide', 'slides/slide1.xml'],
      ['rId3', 'theme', 'theme/theme1.xml'],
    ]),
    'ppt/presentation.xml':
      `<p:presentation ${NS_P}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>` +
      '<p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>',
    'ppt/slideMasters/_rels/slideMaster1.xml.rels': rels([
      ['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'],
      ['rId2', 'theme', '../theme/theme1.xml'],
    ]),
    'ppt/slideMasters/slideMaster1.xml':
      `<p:sldMaster ${NS_P}><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>${GROUP}` +
      placeholder(2, 'Title Placeholder 1', 'title', [838200, 365125, 10515600, 1325563]) +
      placeholder(3, 'Text Placeholder 2', 'body', [838200, 1825625, 10515600, 4351338]) +
      '</p:spTree></p:cSld>' +
      '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>' +
      '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>' +
      '<p:txStyles><p:titleStyle><a:lvl1pPr><a:defRPr sz="4400"/></a:lvl1pPr></p:titleStyle><p:bodyStyle><a:lvl1pPr><a:defRPr sz="2800"/></a:lvl1pPr></p:bodyStyle><p:otherStyle/></p:txStyles>' +
      '</p:sldMaster>',
    'ppt/slideLayouts/_rels/slideLayout1.xml.rels': rels([['rId1', 'slideMaster', '../slideMasters/slideMaster1.xml']]),
    'ppt/slideLayouts/slideLayout1.xml':
      `<p:sldLayout ${NS_P} type="title" preserve="1"><p:cSld name="Title Slide"><p:spTree>${GROUP}` +
      placeholder(2, 'Title 1', 'ctrTitle', TITLE_FRAME) + placeholder(3, 'Subtitle 2', 'subTitle', SUBTITLE_FRAME) +
      '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>',
    'ppt/slides/_rels/slide1.xml.rels': rels([['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml']]),
    'ppt/slides/slide1.xml':
      `<p:sld ${NS_P}><p:cSld><p:spTree>${GROUP}` +
      placeholder(2, 'Title 1', 'ctrTitle') + placeholder(3, 'Subtitle 2', 'subTitle') +
      '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>',
    'ppt/theme/theme1.xml': THEME,
  });
}
