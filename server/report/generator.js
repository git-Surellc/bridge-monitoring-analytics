import { Document, Packer, Paragraph, TextRun, ImageRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType, PageBreak, TableOfContents } from 'docx';
import * as echarts from 'echarts';
import { createCanvas, registerFont } from 'canvas';
import { format } from 'date-fns';
import path from 'path';
import fs from 'fs';

// Try to register a font for Chinese support in ECharts
// This is critical for Aliyun deployment where default fonts might be missing or not support Chinese
const registerCustomFont = () => {
  try {
    // Check common font paths
    const fontPaths = [
      // Standard Linux font paths
      '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc',
      '/usr/share/fonts/truetype/wqy/wqy-microhei.ttc',
      '/usr/share/fonts/truetype/droid/DroidSansFallbackFull.ttf',
      // Common Windows/Mac font paths (for local dev)
      '/System/Library/Fonts/PingFang.ttc',
      'C:\\Windows\\Fonts\\msyh.ttc',
      // Project local font (if we added one later)
      path.join(process.cwd(), 'assets', 'fonts', 'SimHei.ttf')
    ];

    let fontLoaded = false;
    for (const fontPath of fontPaths) {
      if (fs.existsSync(fontPath)) {
        console.log(`Registering font: ${fontPath}`);
        registerFont(fontPath, { family: 'sans-serif' });
        fontLoaded = true;
        break;
      }
    }

    if (!fontLoaded) {
      console.warn('No Chinese font found. Charts might display squares for Chinese characters.');
    }
  } catch (err) {
    console.error('Error registering font:', err);
  }
};

// Register font on module load
registerCustomFont();

// Helper to identify sensor type
const KEYWORDS = {
  INCLINATION: ['倾角', 'inclination', 'tilt'],
  DISPLACEMENT: ['竖向位移', '沉降', 'displacement', 'settlement', '位移', '挠度'],
  ACCELERATION: ['加速度', 'acceleration', '振动', 'vibration'],
  TEMPERATURE: ['温度', 'temperature'],
  CRACK: ['裂缝', 'crack'],
};

const getSensorType = (sensor) => {
  const name = (sensor.name || '').toLowerCase();
  const sheetType = (sensor.sheetType || '').toLowerCase();
  const text = `${name} ${sheetType}`;

  if (KEYWORDS.INCLINATION.some(k => text.includes(k))) return 'inclination';
  if (KEYWORDS.DISPLACEMENT.some(k => text.includes(k))) return 'displacement';
  if (KEYWORDS.ACCELERATION.some(k => text.includes(k))) return 'acceleration';
  if (KEYWORDS.TEMPERATURE.some(k => text.includes(k))) return 'temperature';
  if (KEYWORDS.CRACK.some(k => text.includes(k))) return 'crack';
  
  return null;
};

const getUnit = (sensor) => {
  const type = getSensorType(sensor);
  if (type === 'inclination') return '°';
  if (type === 'acceleration') return 'mg';
  if (type === 'displacement') return 'mm';
  if (type === 'crack') return 'mm';
  return 'mm';
};

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

// Helper to calculate linear regression
const calculateLinearRegression = (points) => {
  if (points.length <= 1) return null;

  const n = points.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  
  for (let i = 0; i < n; i++) {
    const x = points[i][0];
    const y = points[i][1];
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  }
  
  const denominator = n * sumXX - sumX * sumX;
  if (denominator === 0) return null;

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;
  
  const equation = `y = ${slope.toFixed(4)}x ${intercept >= 0 ? '+' : ''}${intercept.toFixed(4)}`;

  return { slope, intercept, equation };
};

// Generate chart image using ECharts
export const generateChartImage = (sensor) => {
  if (!sensor.data || sensor.data.length === 0) {
    console.warn(`[Chart] No data for sensor: ${sensor.name}`);
    return null;
  }

  const width = 800;
  const height = 400;
  const canvas = createCanvas(width, height);
  
  // ECharts initialization with canvas
  const chart = echarts.init(canvas);
  
  try {
    // Prepare data
    const times = sensor.data.map(d => d.time);
    const values = sensor.data.map(d => d.value);
    
    // Calculate Trend Line (Linear Regression)
    let trendData = [];
    if (times.length > 1) {
      const n = times.length;
      let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
      
      // Normalize time to start from 0 to avoid large number precision issues
      const startTime = times[0];
      const x = times.map(t => t - startTime);
      
      for (let i = 0; i < n; i++) {
        sumX += x[i];
        sumY += values[i];
        sumXY += x[i] * values[i];
        sumXX += x[i] * x[i];
      }
      
      const denominator = (n * sumXX - sumX * sumX);
      if (denominator !== 0) {
        const slope = (n * sumXY - sumX * sumY) / denominator;
        const intercept = (sumY - slope * sumX) / n;
        trendData = x.map((xi, i) => [times[i], slope * xi + intercept]);
      }
    }

    const unit = getUnit(sensor);
    const option = {
      animation: false,
      title: {
        text: `${formatSensorTitle(sensor.name)} 时程曲线（单位：${unit}）`,
        left: 'center',
        textStyle: { fontSize: 16 }
      },
      grid: { top: 60, bottom: 40, left: 90, right: 30 },
      xAxis: {
        type: 'category',
        data: times,
        axisLabel: {
          formatter: (value) => {
             // Excel date format (number > 40000)
             if (typeof value === 'number' && value > 40000 && value < 60000) {
               const date = new Date((value - 25569) * 86400 * 1000);
               return format(date, 'MM-dd');
             }
             // Simple date formatting if string looks like date
             if (typeof value === 'string' && value.includes('T')) {
               return value.split('T')[0];
             }
             if (typeof value === 'string' && !isNaN(Date.parse(value))) {
               return format(new Date(value), 'MM-dd');
             }
             return value;
          },
          rotate: 30, // Rotate labels to avoid overlap
          fontSize: 10
        }
      },
      yAxis: {
        type: 'value',
        scale: true, // auto scale
        name: `单位 (${unit})`,
        nameLocation: 'middle',
        nameGap: 45,
        nameTextStyle: { fontSize: 12 }
      },
      series: [
        {
          name: '',
          data: values,
          type: 'line',
          smooth: true,
          symbol: 'none', // no dots for performance
          lineStyle: { width: 2, color: '#2563eb' }
        },
        // Trend Line
        ...(trendData.length > 0 ? [{
          name: '',
          data: trendData,
          type: 'line',
          smooth: false,
          symbol: 'none',
          lineStyle: { width: 2, color: '#dc2626', type: 'dashed', opacity: 0.7 }
        }] : [])
      ]
    };
    
    chart.setOption(option);
    
    return canvas.toBuffer('image/png');
  } finally {
    chart.dispose();
  }
};

export const generateCorrelationChartImage = (tempSensor, defSensor) => {
  const width = 800;
  const height = 400;
  const canvas = createCanvas(width, height);
  const chart = echarts.init(canvas);

  try {
    // Match data points
    const points = [];
    const tempMap = new Map();
    tempSensor.data.forEach(d => tempMap.set(String(d.time), d.value));

    defSensor.data.forEach(d => {
      const timeStr = String(d.time);
      if (tempMap.has(timeStr)) {
        points.push([tempMap.get(timeStr), d.value]);
      }
    });

    if (points.length === 0) return null;

    // Calculate Linear Regression for Correlation Trend Line
    let trendData = [];
    let equation = '';
    
    const regression = calculateLinearRegression(points);
    
    if (regression) {
      const { slope, intercept, equation: eq } = regression;
      equation = eq;
      
      // Generate line points (min X and max X)
      const xValues = points.map(p => p[0]);
      const minX = Math.min(...xValues);
      const maxX = Math.max(...xValues);
      
      trendData = [
        [minX, slope * minX + intercept],
        [maxX, slope * maxX + intercept]
      ];
    }

    const option = {
      animation: false,
      title: {
        text: '温度-变形相关性分析',
        subtext: equation ? `拟合方程: ${equation}` : '',
        left: 'center',
        textStyle: { fontSize: 16 }
      },
      grid: { top: 60, bottom: 40, left: 50, right: 30 },
      legend: {
        data: ['观测数据', '拟合曲线'],
        top: 30
      },
      xAxis: {
        type: 'value',
        name: '温度 (°C)',
        nameLocation: 'middle',
        nameGap: 25,
        scale: true
      },
      yAxis: {
        type: 'value',
        name: '变形 (mm)',
        nameLocation: 'middle',
        nameGap: 25,
        scale: true
      },
      series: [
        {
          name: '观测数据',
          type: 'scatter',
          data: points,
          symbolSize: 6,
          itemStyle: { color: '#7c3aed' } // Purple color
        },
        // Regression Line
        ...(trendData.length > 0 ? [{
          name: '拟合曲线',
          type: 'line',
          data: trendData,
          showSymbol: false,
          lineStyle: { width: 2, color: '#dc2626', type: 'dashed' }
        }] : [])
      ]
    };

    chart.setOption(option);
    return canvas.toBuffer('image/png');
  } finally {
    chart.dispose();
  }
};

export const generateWordReport = async (bridges, cover, reportSections, deviceStatuses, onProgress, groups) => {
  const docChildren = [];
  
  // Calculate total work for progress tracking
  let totalSensors = 0;
  let processedSensors = 0;
  
  if (reportSections) {
    for (const section of reportSections) {
      if (section.type === 'chart_analysis') {
         if (groups && groups.length > 0) {
            for (const group of groups) {
               for (const bridge of group.structures) {
                  totalSensors += (bridge.sensors || []).length;
               }
            }
         } else {
            for (const bridge of bridges) {
               totalSensors += (bridge.sensors || []).length;
            }
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
          
          const processBridge = async (bridge) => {
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
                 
                 if (imageBuffer) {
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
                           // Use object format for transformation if needed, but width/height is standard
                         }),
                       ],
                       alignment: AlignmentType.CENTER,
                       spacing: { after: 200 },
                     })
                   );
                 }

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
                      ...(sensor.stats.mean !== undefined && sensor.stats.mean !== null && Number.isFinite(Number(sensor.stats.mean)) 
                        ? [
                          new Paragraph({
                            children: [
                               new TextRun({ text: "平均值: ", bold: true }),
                               new TextRun({ text: `${sensor.stats.mean}` }),
                            ],
                            spacing: { after: 200 },
                          })
                        ] 
                        : [])
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
                     })
                   );

                   // Add Correlation Chart and Analysis
                   let equation = 'N/A';
                   
                   try {
                      const tempSensor = bridge.sensors.find(s => getSensorType(s) === 'temperature');
                      const defSensor = bridge.sensors.find(s => getSensorType(s) === 'displacement' || getSensorType(s) === 'inclination');
                      
                      if (tempSensor && defSensor) {
                        // Calculate equation for text summary
                        const points = [];
                        const tempMap = new Map();
                        tempSensor.data.forEach(d => tempMap.set(String(d.time), d.value));

                        defSensor.data.forEach(d => {
                          const timeStr = String(d.time);
                          if (tempMap.has(timeStr)) {
                            points.push([tempMap.get(timeStr), d.value]);
                          }
                        });

                        const regression = calculateLinearRegression(points);
                        if (regression) {
                          equation = regression.equation;
                        }

                        const scatterBuffer = generateCorrelationChartImage(tempSensor, defSensor);
                        if (scatterBuffer) {
                          docChildren.push(
                            new Paragraph({
                              children: [
                                new ImageRun({
                                  data: scatterBuffer,
                                  transformation: { width: 600, height: 300 },
                                  type: 'png',
                                }),
                              ],
                              alignment: AlignmentType.CENTER,
                              spacing: { after: 200 },
                            })
                          );
                        }
                      }
                   } catch (err) {
                      console.error('Error generating correlation chart:', err);
                   }

                   docChildren.push(
                     new Paragraph({
                       children: [
                         new TextRun({ text: `相关系数 (Pearson): ${Number(corr.correlation).toFixed(4)}`, bold: true }),
                         new TextRun({ text: `\t显著性 (P-Value): ${Number(corr.pValue).toFixed(4)} (${corr.isSignificant ? '显著' : '不显著'})` }),
                       ],
                       spacing: { after: 50 },
                     }),
                     new Paragraph({
                       children: [
                         new TextRun({ text: `相关强度: ${corr.corrStrength}` }),
                         new TextRun({ text: `\t相关方向: ${corr.corrDirection}` }),
                       ],
                       spacing: { after: 50 },
                     }),
                     new Paragraph({
                       children: [
                         new TextRun({ text: `拟合方程: ${equation}`, bold: true }),
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
                         const parts = [];
                         if (quality.mean !== undefined && quality.mean !== null && Number.isFinite(Number(quality.mean))) {
                           parts.push(`均值: ${Number(quality.mean).toFixed(4)}`);
                         }
                         parts.push(`缺失率: ${Number(quality.missingRate).toFixed(4)}%`, `异常点: ${quality.outlierCount}`);
                         details.push(new Paragraph({ text: `【数据质量】${parts.join(', ')}` }));
                      }
                      if (trend) {
                         details.push(new Paragraph({ text: `【趋势分析】斜率: ${Number(trend.slope).toFixed(4)}, R²: ${Number(trend.rSquared).toFixed(4)}, 趋势: ${trend.trendDesc}` }));
                      }
                      if (deformation) {
                         details.push(new Paragraph({ text: `【变形分析】极差: ${Number(deformation.rangeValue).toFixed(4)}, 周期: ${deformation.periodicFeatures.mainPeriods.join(', ') || '无'}` }));
                      }
                      if (acceleration) {
                         details.push(new Paragraph({ text: `【振动分析】PGA: ${Number(acceleration.pga).toFixed(4)}, 主频: ${Number(acceleration.naturalFreq).toFixed(4)}Hz (${acceleration.isFreqAbnormal ? '异常' : '正常'})` }));
                      }
                      if (crack) {
                         details.push(new Paragraph({ text: `【裂缝分析】当前宽度: ${Number(crack.maxWidth).toFixed(4)}mm, 7日预测: ${Number(crack.predictedWidth7d).toFixed(4)}mm, 风险: ${crack.riskLevel}` }));
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
          };

          if (groups && groups.length > 0) {
             for (const group of groups) {
                docChildren.push(
                   new Paragraph({
                      text: group.name,
                      heading: HeadingLevel.HEADING_2,
                      spacing: { before: 400, after: 200 },
                   })
                );
                for (const bridge of group.structures) {
                   await processBridge(bridge);
                }
             }
          } else {
             for (const bridge of bridges) {
                await processBridge(bridge);
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
