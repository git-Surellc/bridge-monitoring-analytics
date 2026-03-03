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
                           new TextRun({ text: "平均值: ", bold: true }),
                           new TextRun({ text: `${sensor.stats.mean}` }),
                        ],
                        spacing: { after: 200 },
                      })
                    );
                 }
               } catch (err) {
                 console.error(`Error generating chart for sensor ${sensor.id}:`, err);
                 // Continue with other sensors even if one fails
               }
             }

             // Add Algorithm Analysis Section
             if (bridge.analysis) {
               const analysis = bridge.analysis;
               const hasAnalysis = (Object.keys(analysis.quality || {}).length > 0) || analysis.correlation;
               
               if (hasAnalysis) {
                 docChildren.push(
                   new Paragraph({
                     text: "算法分析模块",
                     heading: HeadingLevel.HEADING_3,
                     spacing: { before: 300, after: 150 },
                   })
                 );

                 // 1. Correlation Analysis
                 if (analysis.correlation) {
                   const corr = analysis.correlation;
                   docChildren.push(
                     new Paragraph({
                       text: "温度-变形联动分析",
                       heading: HeadingLevel.HEADING_4,
                       spacing: { before: 150, after: 100 },
                     }),
                     new Paragraph({
                       children: [
                         new TextRun({ text: `相关系数 (Pearson): ${corr.correlation}`, bold: true }),
                         new TextRun({ text: `\t显著性 (P-Value): ${corr.pValue} (${corr.isSignificant ? '显著' : '不显著'})` }),
                       ],
                       spacing: { after: 50 },
                     }),
                     new Paragraph({
                       children: [
                         new TextRun({ text: `相关强度: ${corr.corrStrength}` }),
                         new TextRun({ text: `\t相关方向: ${corr.corrDirection}` }),
                       ],
                       spacing: { after: 200 },
                     })
                   );
                 }

                 // 2. Sensor Analysis Results
                 const allSensors = new Set([
                   ...Object.keys(analysis.quality || {}),
                   ...Object.keys(analysis.trend || {}),
                   ...Object.keys(analysis.deformation || {}),
                   ...Object.keys(analysis.acceleration || {}),
                   ...Object.keys(analysis.crack || {})
                 ]);

                 if (allSensors.size > 0) {
                    docChildren.push(
                      new Paragraph({
                        text: "各测点专项分析",
                        heading: HeadingLevel.HEADING_4,
                        spacing: { before: 150, after: 100 },
                      })
                    );

                    // Create table for sensor analysis
                    const tableRows = [
                      new TableRow({
                        children: [
                          new TableCell({ children: [new Paragraph({ text: "测点名称", bold: true })], width: { size: 20, type: WidthType.PERCENTAGE } }),
                          new TableCell({ children: [new Paragraph({ text: "分析指标", bold: true })], width: { size: 80, type: WidthType.PERCENTAGE } }),
                        ],
                      })
                    ];

                    Array.from(allSensors).sort().forEach(sensorId => {
                      const quality = analysis.quality?.[sensorId];
                      const trend = analysis.trend?.[sensorId];
                      const deformation = analysis.deformation?.[sensorId];
                      const acceleration = analysis.acceleration?.[sensorId];
                      const crack = analysis.crack?.[sensorId];

                      const details = [];

                      if (quality) {
                         details.push(new Paragraph({ text: `【数据质量】均值: ${quality.mean}, 缺失率: ${quality.missingRate}%, 异常点: ${quality.outlierCount}` }));
                      }
                      if (trend) {
                         details.push(new Paragraph({ text: `【趋势分析】斜率: ${trend.slope}, R²: ${trend.rSquared}, 趋势: ${trend.trendDesc}` }));
                      }
                      if (deformation) {
                         details.push(new Paragraph({ text: `【变形分析】极差: ${deformation.rangeValue}, 周期: ${deformation.periodicFeatures.mainPeriods.join(', ') || '无'}` }));
                      }
                      if (acceleration) {
                         details.push(new Paragraph({ text: `【振动分析】PGA: ${acceleration.pga}, 主频: ${acceleration.naturalFreq}Hz (${acceleration.isFreqAbnormal ? '异常' : '正常'})` }));
                      }
                      if (crack) {
                         details.push(new Paragraph({ text: `【裂缝分析】当前宽度: ${crack.maxWidth}mm, 7日预测: ${crack.predictedWidth7d}mm, 风险: ${crack.riskLevel}` }));
                      }

                      tableRows.push(
                        new TableRow({
                          children: [
                            new TableCell({ children: [new Paragraph(sensorId)] }),
                            new TableCell({ children: details }),
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
                 }
               }
             }

             // Add AI Analysis Section if available
             if (bridge.aiAnalysis) {
               docChildren.push(
                 new Paragraph({
                   text: "AI 智能诊断结论",
                   heading: HeadingLevel.HEADING_3,
                   spacing: { before: 300, after: 150 },
                 }),
                 new Paragraph({
                   children: [
                     new TextRun({ 
                       text: bridge.aiAnalysis,
                       font: "Calibri" // Optional: specify font
                     })
                   ],
                   alignment: AlignmentType.JUSTIFIED,
                   spacing: { after: 300 },
                 })
               );
             }
          }
          
          docChildren.push(new Paragraph({ children: [new PageBreak()] }));
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
