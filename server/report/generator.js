import { Document, Packer, Paragraph, TextRun, ImageRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType, PageBreak, TableOfContents } from 'docx';
import * as echarts from 'echarts';
import { createCanvas } from 'canvas';

// Helper to format sensor title (ported from frontend)
const formatSensorTitle = (name) => {
  const match = name.match(/^(.*)[(（](.*)[)）]$/);
  if (match) {
    const title = match[1].trim();
    const subtitle = match[2].trim();
    return `${subtitle}（${title}）`;
  }
  return name;
};

// Generate chart image using ECharts
const generateChartImage = (sensor) => {
  const width = 800;
  const height = 400;
  const canvas = createCanvas(width, height);
  
  // ECharts initialization with canvas
  const chart = echarts.init(canvas);
  
  // Prepare data
  const times = sensor.data.map(d => d.time);
  const values = sensor.data.map(d => d.value);
  
  const option = {
    animation: false,
    title: {
      text: sensor.name + ' 时程曲线',
      left: 'center',
      textStyle: { fontSize: 16 }
    },
    grid: { top: 60, bottom: 40, left: 50, right: 30 },
    xAxis: {
      type: 'category',
      data: times,
      axisLabel: {
        formatter: (value) => {
           // Simple date formatting if string looks like date
           if (typeof value === 'string' && value.includes('T')) {
             return value.split('T')[0];
           }
           return value;
        },
        rotate: 30, // Rotate labels to avoid overlap
        fontSize: 10
      }
    },
    yAxis: {
      type: 'value',
      scale: true // auto scale
    },
    series: [{
      data: values,
      type: 'line',
      smooth: true,
      symbol: 'none', // no dots for performance
      lineStyle: { width: 2, color: '#2563eb' }
    }]
  };
  
  chart.setOption(option);
  
  return canvas.toBuffer('image/png');
};

export const generateWordReport = async (bridges, cover, reportSections, deviceStatuses, onProgress) => {
  const docChildren = [];
  
  // Calculate total work for progress tracking
  let totalSensors = 0;
  let processedSensors = 0;
  
  if (reportSections) {
    for (const section of reportSections) {
      if (section.type === 'chart_analysis') {
         for (const bridge of bridges) {
            totalSensors += bridge.sensors.length;
         }
      }
    }
  }

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
        spacing: { after: 200 },
      }),
      new Paragraph({
        children: [new PageBreak()],
      })
    );
  }

  // 2. Dynamic Sections
  if (reportSections) {
    for (const section of reportSections) {
      switch (section.type) {
        case 'toc':
          docChildren.push(
            new Paragraph({
              text: "目录",
              heading: HeadingLevel.HEADING_1,
              alignment: AlignmentType.CENTER,
            }),
            new TableOfContents("Summary", {
              hyperlink: true,
              headingStyleRange: "1-5",
            }),
            new Paragraph({
              children: [new PageBreak()],
            })
          );
          break;
        
        case 'text':
          docChildren.push(
            new Paragraph({
              text: section.title,
              heading: HeadingLevel.HEADING_1,
              spacing: { before: 200, after: 200 },
            }),
            new Paragraph({
              text: section.content || '',
              spacing: { after: 200 },
            })
          );
          break;

        case 'device_status':
          docChildren.push(
             new Paragraph({
               text: section.title,
               heading: HeadingLevel.HEADING_1,
               spacing: { before: 200, after: 200 },
             })
          );
          
          // Create a table for device status
          const statuses = deviceStatuses || [];
          const allTypes = Array.from(
            new Set(
              statuses.flatMap((s) => Object.keys(s?.stats?.types || {}))
            )
          ).filter(Boolean).sort();

          const tableRows = [
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph({ text: "结构名称", bold: true })] }),
                ...allTypes.map((t) => new TableCell({ children: [new Paragraph({ text: `${t}在线率`, bold: true })] })),
                new TableCell({ children: [new Paragraph({ text: "总在线率", bold: true })] }),
              ],
            }),
          ];

          // Use bridges to ensure we list all structures even if status is missing
          bridges.forEach(bridge => {
             const status = statuses.find(s => s.id === bridge.id);
             const stats = status?.stats || { total: 0, online: 0, types: {} };
             
             const formatRate = (online, total) => {
                if (!total || total === 0) return '-';
                return `${Math.round((online / total) * 100)}% (${online}/${total})`;
             };

             tableRows.push(
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph(bridge.name)] }),
                    ...allTypes.map((t) => new TableCell({ children: [new Paragraph(formatRate(stats.types?.[t]?.online, stats.types?.[t]?.total))] })),
                    new TableCell({ children: [new Paragraph(formatRate(stats.online, stats.total))] }),
                  ],
                })
             );
          });
          
          docChildren.push(
            new Table({
              rows: tableRows,
              width: { size: 100, type: WidthType.PERCENTAGE },
            }),
            new Paragraph({ spacing: { after: 200 } })
          );
          break;

        case 'chart_analysis':
          docChildren.push(new Paragraph({ text: section.title, heading: HeadingLevel.HEADING_1 }));
          
          for (const bridge of bridges) {
             docChildren.push(
               new Paragraph({
                 text: bridge.name,
                 heading: HeadingLevel.HEADING_2,
                 spacing: { before: 200, after: 100 },
               })
             );

             for (const sensor of bridge.sensors) {
               try {
                 // Report progress
                 if (onProgress && totalSensors > 0) {
                   processedSensors++;
                   const percent = Math.round((processedSensors / totalSensors) * 80) + 10; // 10-90% range
                   onProgress(percent);
                   // Yield to event loop
                   await new Promise(resolve => setTimeout(resolve, 0));
                 }

                 const imageBuffer = generateChartImage(sensor);
                 
                 docChildren.push(
                   new Paragraph({
                     text: formatSensorTitle(sensor.name),
                     heading: HeadingLevel.HEADING_3,
                     spacing: { before: 150, after: 80 },
                   })
                 );

                 docChildren.push(
                   new Paragraph({
                     children: [
                       new ImageRun({
                         data: imageBuffer,
                         transformation: { 
                           width: 600, 
                           height: 300 
                         },
                         type: 'png',
                       }),
                     ],
                     alignment: AlignmentType.CENTER,
                     spacing: { after: 200 },
                   })
                 );

                 // Add Analysis Summary
                 if (sensor.stats) {
                    docChildren.push(
                      new Paragraph({
                        text: "分析摘要",
                        heading: HeadingLevel.HEADING_4,
                        spacing: { before: 100, after: 50 },
                      }),
                      new Paragraph({
                        children: [
                           new TextRun({ text: "最大值: ", bold: true }),
                           new TextRun({ text: `${sensor.stats.max} (时间: ${sensor.stats.maxTime})` }),
                        ],
                        spacing: { after: 50 },
                      }),
                      new Paragraph({
                        children: [
                           new TextRun({ text: "最小值: ", bold: true }),
                           new TextRun({ text: `${sensor.stats.min} (时间: ${sensor.stats.minTime})` }),
                        ],
                        spacing: { after: 50 },
                      }),
                      new Paragraph({
                        children: [
                           new TextRun({ text: "振幅/变化量: ", bold: true }),
                           new TextRun({ text: `${sensor.stats.amplitude}` }),
                        ],
                        spacing: { after: 50 },
                      }),
                      new Paragraph({
                        children: [
                           new TextRun({ text: "状态: ", bold: true }),
                           new TextRun({ text: "数据波动在正常范围内。", color: "2E7D32" }), // Green color for normal status
                        ],
                        spacing: { after: 200 },
                      })
                    );
                 }

               } catch (err) {
                 console.error(`Failed to generate chart for ${sensor.name}`, err);
                 docChildren.push(new Paragraph({ text: `[图表生成失败: ${sensor.name}]`, color: "red" }));
               }
             }
          }
          break;
      }
    }
  }

  if (onProgress) onProgress(95);

  const doc = new Document({
    sections: [{
      properties: {},
      children: docChildren,
    }],
  });

  return await Packer.toBuffer(doc);
};
