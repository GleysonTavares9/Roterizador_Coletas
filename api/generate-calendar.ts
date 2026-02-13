
// api/generate-calendar.ts

// Mapeamento de dias para JS (0=Dom, 1=Seg...)
const MAP_DIAS: Record<string, number> = {
    'SEGUNDA': 1, 'SEG': 1, '2A': 1, '2\u00AA': 1, 'MON': 1,
    'TERCA': 2, 'TER\u00C7A': 2, 'TER': 2, '3A': 2, '3\u00AA': 2, 'TUE': 2,
    'QUARTA': 3, 'QUA': 3, '4A': 3, '4\u00AA': 3, 'WED': 3,
    'QUINTA': 4, 'QUI': 4, '5A': 4, '5\u00AA': 4, 'THU': 4,
    'SEXTA': 5, 'SEX': 5, '6A': 5, '6\u00AA': 5, 'FRI': 5,
    'SABADO': 6, 'S\u00C1BADO': 6, 'SAB': 6, 'SAT': 6,
    'DOMINGO': 0, 'DOM': 0, 'SUN': 0
};

const NOMES_DIAS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];

function getDayName(date: Date) {
    return NOMES_DIAS[date.getDay()];
}

const PADROES_COMPLEXOS = [
    { regex: /SEGUNDA.*SEXTA/i, dias: [1, 2, 3, 4, 5] },
    { regex: /SEGUNDA.*SABADO|SEGUNDA.*S\u00C1BADO/i, dias: [1, 2, 3, 4, 5, 6] },
    { regex: /SEGUNDA.*DOMINGO/i, dias: [1, 2, 3, 4, 5, 6, 0] },
    { regex: /SEGUNDA.*QUARTA.*SEXTA/i, dias: [1, 3, 5] },
    { regex: /SEGUNDA.*QUINTA/i, dias: [1, 4] },
    { regex: /TERCA.*QUINTA|TER\u00C7A.*QUINTA/i, dias: [2, 4] },
    { regex: /TERCA.*SEXTA|TER\u00C7A.*SEXTA/i, dias: [2, 5] },
    { regex: /QUARTA.*SEXTA/i, dias: [3, 5] }
];

function extrairDiasSemana(periodicidade: string): number[] {
    if (!periodicidade) return [];
    const s = periodicidade.toUpperCase();
    const diasSet = new Set<number>();

    for (const p of PADROES_COMPLEXOS) {
        if (p.regex.test(s)) return p.dias;
    }

    for (const key in MAP_DIAS) {
        if (s.includes(key)) diasSet.add(MAP_DIAS[key]);
    }

    if (diasSet.size === 0 && (s.includes('DIARIO') || s.includes('DI\u00C1RIO'))) {
        return [0, 1, 2, 3, 4, 5, 6];
    }

    if (diasSet.size === 0) return [1, 2, 3, 4, 5];

    return Array.from(diasSet).sort();
}

function getNthWeekday(year: number, month: number, dayOfWeek: number, n: number): Date | null {
    const date = new Date(year, month - 1, 1);
    while (date.getDay() !== dayOfWeek) {
        date.setDate(date.getDate() + 1);
    }
    date.setDate(date.getDate() + (n - 1) * 7);
    if (date.getMonth() === month - 1) return date;
    return null;
}

function getLastWeekday(year: number, month: number, dayOfWeek: number): Date {
    const date = new Date(year, month, 0);
    while (date.getDay() !== dayOfWeek) {
        date.setDate(date.getDate() - 1);
    }
    return date;
}

export default async function handler(req: any, res: any) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        const { points, month, year } = req.body;
        const m = month ? parseInt(month) : new Date().getMonth() + 1;
        const y = year ? parseInt(year) : new Date().getFullYear();

        if (!points || !Array.isArray(points)) {
            return res.status(400).json({ error: 'Pontos inv\u00E1lidos ou ausentes.' });
        }

        const calendar = [];

        for (const p of points) {
            const freqOrig = p.frequency || p.Periodicidade || p.periodicidade || '';
            const freq = String(freqOrig).toUpperCase().trim();
            if (!freq) continue;

            const datesToAdd: Date[] = [];
            const diasSemana = extrairDiasSemana(freq);

            if (freq.includes('MENSAL') || freq.includes('MEN')) {
                let found = false;
                if (freq.includes('ULTIMA') || freq.includes('\u00DALTIMA')) {
                    for (const d of diasSemana) {
                        datesToAdd.push(getLastWeekday(y, m, d));
                    }
                    found = true;
                }

                const regexOcc = /(\d+)[ºª]?\s*([A-Z\u00C7\u00C3]+)/g;
                let matchOcc;
                while (true) {
                    matchOcc = regexOcc.exec(freq);
                    if (!matchOcc) break;

                    const n = parseInt(matchOcc[1]);
                    const diaNome = matchOcc[2];
                    let diaNum = -1;
                    for (const k in MAP_DIAS) {
                        if (diaNome.includes(k)) {
                            diaNum = MAP_DIAS[k];
                            break;
                        }
                    }
                    if (diaNum !== -1) {
                        const d = getNthWeekday(y, m, diaNum, n);
                        if (d) {
                            datesToAdd.push(d);
                            found = true;
                        }
                    }
                }
                if (!found && datesToAdd.length === 0) {
                    datesToAdd.push(new Date(y, m - 1, 1));
                }
            }
            else if (freq.includes('QUINZENAL') || freq.includes('QZ')) {
                const regexQz = /(\d+)[ºª]?\s*E\s*(\d+)[ºª]?\s*([A-Z\u00C7\u00C3]+)/;
                const matchQz = freq.match(regexQz);
                if (matchQz) {
                    const occ1 = parseInt(matchQz[1]);
                    const occ2 = parseInt(matchQz[2]);
                    const diaNome = matchQz[3];
                    let diaNum = -1;
                    for (const k in MAP_DIAS) {
                        if (diaNome.includes(k)) {
                            diaNum = MAP_DIAS[k];
                            break;
                        }
                    }
                    if (diaNum !== -1) {
                        const d1 = getNthWeekday(y, m, diaNum, occ1);
                        if (d1) datesToAdd.push(d1);
                        const d2 = getNthWeekday(y, m, diaNum, occ2);
                        if (d2) datesToAdd.push(d2);
                    }
                } else {
                    for (const d of diasSemana) {
                        const d1 = getNthWeekday(y, m, d, 1);
                        if (d1) datesToAdd.push(d1);
                        const d3 = getNthWeekday(y, m, d, 3);
                        if (d3) datesToAdd.push(d3);
                    }
                }
            }
            else if (freq.includes('BIM') || freq.includes('TRI')) {
                let skip = false;
                if (freq.includes('BIM') && m % 2 === 0) skip = true;
                if (freq.includes('TRI') && ![1, 4, 7, 10].includes(m)) skip = true;

                if (!skip) {
                    const regexOcc = /(\d+)[ºª]?\s*([A-Z\u00C7\u00C3]+)/g;
                    let matchOcc;
                    while (true) {
                        matchOcc = regexOcc.exec(freq);
                        if (!matchOcc) break;

                        const n = parseInt(matchOcc[1]);
                        const diaNome = matchOcc[2];
                        let diaNum = -1;
                        for (const k in MAP_DIAS) {
                            if (diaNome.includes(k)) {
                                diaNum = MAP_DIAS[k];
                                break;
                            }
                        }
                        if (diaNum !== -1) {
                            const d = getNthWeekday(y, m, diaNum, n);
                            if (d) datesToAdd.push(d);
                        }
                    }
                }
            }
            else {
                const weekMatch = freq.match(/SEMANA\s*([0-9,\sE]+)/);
                let allowedWeeks: number[] | null = null;
                if (weekMatch) {
                    const rawParts = weekMatch[1].split(/[,\sE]+/);
                    allowedWeeks = [];
                    for (const part of rawParts) {
                        const n = parseInt(part.trim());
                        if (!isNaN(n)) allowedWeeks.push(n);
                    }
                }

                const daysInMonth = new Date(y, m, 0).getDate();
                for (let d = 1; d <= daysInMonth; d++) {
                    const date = new Date(y, m - 1, d);
                    const currentDay = date.getDay();
                    let isTargetDay = false;
                    for (const target of diasSemana) {
                        if (target === currentDay) {
                            isTargetDay = true;
                            break;
                        }
                    }

                    if (isTargetDay) {
                        if (allowedWeeks) {
                            const weekNum = Math.floor((d - 1) / 7) + 1;
                            let weekMatched = false;
                            for (const w of allowedWeeks) {
                                if (w === weekNum) {
                                    weekMatched = true;
                                    break;
                                }
                            }
                            if (!weekMatched) continue;
                        }
                        datesToAdd.push(date);
                    }
                }
            }

            for (const date of datesToAdd) {
                const dStr = date.getDate().toString().padStart(2, '0');
                const mStr = (date.getMonth() + 1).toString().padStart(2, '0');
                const yStr = date.getFullYear();

                calendar.push({
                    Data: `${dStr}/${mStr}/${yStr}`,
                    Dia_Semana: getDayName(date),
                    Rota: p.route_name || p.Rota || p.rota || 'ROTA',
                    Unidade: p.unit_name || p.Unidade || p.unidade,
                    Cliente: p.client_name || p.Cliente || p.apelido || p.Apelido,
                    Vetor_Custo_Nome: p.cost_vector_name || p.Vetor_Custo_Nome || p['Vetor de custo nome'],
                    'Endere\u00E7o': p.address || p['Endere\u00E7o'] || p.Endereco || p.endereco,
                    Cidade: p.city || p.Cidade || p.cidade,
                    Bairro: p.neighborhood || p.Bairro || p.bairro,
                    Periodicidade: p.frequency || p.Periodicidade || p.periodicidade,
                    Media_Por_Coleta: p.avg_weight || p.Media_Por_Coleta || p['Media Por Coleta'] || 0,
                    Latitude: p.latitude || p.Latitude,
                    Longitude: p.longitude || p.Longitude
                });
            }
        }

        return res.status(200).json({ calendar, totalGenerated: calendar.length });

    } catch (error: any) {
        console.error('API Error:', error);
        return res.status(500).json({ error: error.message || 'Server Error' });
    }
}
