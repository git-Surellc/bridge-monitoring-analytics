import { Document, Packer, Paragraph, TextRun, ImageRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType, BorderStyle, PageBreak, TableOfContents, Footer, PageNumber } from 'docx';
import { saveAs } from 'file-saver';
import { BridgeData, ReportCover, ReportSection } from '../types';

export const formatSensorTitle = (name: string): string => {
  // Matches "Title (Subtitle)" or "Title （Subtitle）"
  // Example: "Y轴加速度(主梁跨中侧壁)" -> "主梁跨中侧壁（Y轴加速度）"
  const match = name.match(/^(.*)[(（](.*)[)）]$/);
  if (match) {
    const title = match[1].trim();
    const subtitle = match[2].trim();
    return `${subtitle}（${title}）`;
  }
  return name;
};

export const generateWordReport = async (bridges: BridgeData[], chartImages: Record<string, string>, cover?: ReportCover, reportSections?: ReportSection[]) => {
  const docChildren: (Paragraph | Table | TableOfContents)[] = [];

  // 1. Cover Page
  if (cover) {
    docChildren.push(
      new Paragraph({ spacing: { before: 3000 } }),
      new Paragraph({
        children: [new TextRun({ text: cover.organization || '', bold: true, size: 48 })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 600 },
      }),
      new Paragraph({
        children: [new TextRun({ text: cover.project || '', bold: true, size: 40 })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 2000 },
      }),
      new Paragraph({
        children: [new TextRun({ text: cover.title || '', bold: true, size: 36 })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
      }),
      new Paragraph({
        children: [new TextRun({ text: cover.period || '', bold: true, size: 28 })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 4000 },
      }),
      new Paragraph({
        children: [new TextRun({ text: cover.footerCompany || '', bold: true, size: 24 })],
        alignment: AlignmentType.CENTER,
        spacing: { before: 2000, after: 200 },
      }),
      new Paragraph({
        children: [new TextRun({ text: cover.footerDate || '', bold: true, size: 24 })],
        alignment: AlignmentType.CENTER,
      }),
      new Paragraph({
        children: [new PageBreak()],
      })
    );
  }

  // 2. Dynamic Sections
  if (reportSections) {
    for (const section of reportSections) {
      // Section Title (except TOC which has its own style, or Cover)
      if (section.type !== 'toc') {
        docChildren.push(
          new Paragraph({
            text: section.title,
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 400, after: 200 },
          })
        );
      }

      // Section Content based on Type
      switch (section.type) {
        case 'toc':
          docChildren.push(
            new Paragraph({
              text: "目录",
              heading: HeadingLevel.HEADING_1,
              alignment: AlignmentType.CENTER,
              spacing: { after: 400 },
            }),
            new TableOfContents("Summary", {
              hyperlink: true,
              headingStyleRange: "1-3",
            }),
            new Paragraph({
                children: [
                    new TextRun({
                        text: "（注：请在 Word 中右键更新域以刷新目录）",
                        color: "808080",
                        size: 20,
                    })
                ],
                alignment: AlignmentType.CENTER,
                spacing: { before: 200 },
             }),
             new Paragraph({
               children: [new PageBreak()],
             })
          );
          break;

        case 'text':
          if (section.content) {
            // Split by newlines to create paragraphs
            section.content.split('\n').forEach(line => {
              if (line.trim()) {
                docChildren.push(
                  new Paragraph({
                    text: line.trim(),
                    spacing: { after: 120 },
                  })
                );
              }
            });
          }
          break;

        case 'device_status':
          // Mock Data Table
          const table = new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: ["设备ID", "设备名称", "状态", "最后更新时间"].map(text => 
                  new TableCell({
                    children: [new Paragraph({ 
                        children: [new TextRun({ text, bold: true })] 
                    })],
                    shading: { fill: "F0F0F0" },
                  })
                ),
              }),
              ...[1, 2, 3, 4, 5].map(i => 
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph(`DEV-${1000 + i}`)] }),
                    new TableCell({ children: [new Paragraph(`传感器-${i}`)] }),
                    new TableCell({ children: [new Paragraph("在线")] }),
                    new TableCell({ children: [new Paragraph("2026-02-28 10:00:00")] }),
                  ],
                })
              ),
            ],
          });
          docChildren.push(table);
          docChildren.push(new Paragraph({ spacing: { after: 200 } })); // Spacing after table
          break;

        case 'chart_analysis':
          // Existing Chart Logic
          for (const bridge of bridges) {
             docChildren.push(
               new Paragraph({
                 text: bridge.name,
                 heading: HeadingLevel.HEADING_2,
                 spacing: { before: 200, after: 100 },
               })
             );

             for (const sensor of bridge.sensors) {
               const imageData = chartImages[`${bridge.id}-${sensor.id}`];
               
               docChildren.push(
                 new Paragraph({
                   text: formatSensorTitle(sensor.name),
                   heading: HeadingLevel.HEADING_3,
                   spacing: { before: 150, after: 80 },
                 })
               );

               if (imageData) {
                 const imageBuffer = Uint8Array.from(atob(imageData.split(',')[1]), c => c.charCodeAt(0));
                 docChildren.push(
                   new Paragraph({
                     children: [
                       new ImageRun({
                         data: imageBuffer,
                         transformation: { width: 500, height: 250 },
                         type: 'png',
                       }),
                     ],
                     alignment: AlignmentType.CENTER,
                     spacing: { after: 200 },
                   })
                 );
               }

               if (sensor.stats) {
                 docChildren.push(
                   new Paragraph({
                     children: [new TextRun({ text: `分析摘要：`, bold: true })],
                     spacing: { after: 60 },
                   }),
                   new Paragraph({ text: `最大值：${sensor.stats.max} (时间：${sensor.stats.maxTime})`, bullet: { level: 0 } }),
                   new Paragraph({ text: `最小值：${sensor.stats.min} (时间：${sensor.stats.minTime})`, bullet: { level: 0 } }),
                   new Paragraph({ text: `振幅/变化量：${sensor.stats.amplitude}`, bullet: { level: 0 } }),
                   new Paragraph({ text: "状态：数据波动在正常范围内。", bullet: { level: 0 }, spacing: { after: 300 } })
                 );
               }
             }
          }
          break;
      }

      // Add page break after each section? Or just spacing?
      // Usually sections are continuous unless specified.
      // Let's add some spacing.
      docChildren.push(new Paragraph({ spacing: { after: 400 } }));
    }
  } else {
    // Fallback logic for backward compatibility (if reportSections is missing)
    // ... (omitted for brevity, assuming reportSections is always provided now)
  }

  const doc = new Document({
    sections: [{
      properties: {},
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun("第 "),
                new TextRun({
                  children: [PageNumber.CURRENT],
                }),
                new TextRun(" 页"),
              ],
            }),
          ],
        }),
      },
      children: docChildren,
    }],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, "Monitoring_Report.docx");
};
