
export default async function handler(req: any, res: any) {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { calendarData, routes: selectedRoutes, depots } = req.body;

        if (!calendarData || !Array.isArray(calendarData)) {
            return res.status(400).json({ error: 'Dados do calendário inválidos ou ausentes.' });
        }

        const filteredCalendarData = (selectedRoutes && selectedRoutes.length > 0)
            ? calendarData.filter((p: any) => selectedRoutes.includes(p.Rota))
            : calendarData;

        const routeColors = [
            '#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231',
            '#911eb4', '#46f0f0', '#f032e6', '#bcf60c', '#fabebe',
            '#008080', '#e6beff', '#9a6324', '#fffac8', '#800000',
            '#aaffc3', '#808000', '#ffd8b1', '#000075', '#808080'
        ];

        const resumenVeiculos: any = {};
        const todasDatas = [...new Set(filteredCalendarData.map((p: any) => p.Data))].filter(Boolean).sort();
        const todasUnidades = [...new Set(filteredCalendarData.map((p: any) => p.Unidade))].filter(Boolean).sort();

        filteredCalendarData.forEach((p: any) => {
            if (!resumenVeiculos[p.Rota]) {
                resumenVeiculos[p.Rota] = {
                    placa: p.Rota,
                    unidade: p.Unidade || 'PADRAO',
                    pontos: 0,
                    peso: 0,
                    capacidade: 1000,
                    cor: routeColors[Object.keys(resumenVeiculos).length % routeColors.length],
                    datas: {}
                };
            }

            resumenVeiculos[p.Rota].pontos++;
            resumenVeiculos[p.Rota].peso += (p.Media_Por_Coleta || 0);

            if (!resumenVeiculos[p.Rota].datas[p.Data]) {
                resumenVeiculos[p.Rota].datas[p.Data] = { pontos: 0, peso: 0 };
            }
            resumenVeiculos[p.Rota].datas[p.Data].pontos++;
            resumenVeiculos[p.Rota].datas[p.Data].peso += (p.Media_Por_Coleta || 0);
        });

        const center = depots && depots.length > 0 && depots[0].latitude
            ? [depots[0].latitude, depots[0].longitude]
            : [-2.53, -44.30];

        const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Mapa de Rotas Otimizado</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <style>
        body { margin: 0; padding: 0; font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; height: 100vh; overflow: hidden; background: #f4f4f4; }
        #map { height: 100vh; width: 100vw; z-index: 1; }
        
        /* Floating Toolbar */
        #toolbar {
            position: fixed; top: 15px; left: 50%; transform: translateX(-50%);
            z-index: 1001; background: white; padding: 8px 15px; border-radius: 8px;
            display: flex; align-items: center; gap: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            border: 1px solid #ddd; width: auto; max-width: 90vw;
        }
        .toolbar-group { display: flex; align-items: center; gap: 8px; border-right: 1px solid #eee; padding-right: 12px; }
        .toolbar-group:last-child { border-right: none; padding-right: 0; }
        .tool-icon { cursor: pointer; font-size: 16px; opacity: 0.7; transition: opacity 0.2s; }
        .tool-icon:hover { opacity: 1; color: #4CAF50; }
        .toolbar-select { padding: 4px 8px; border-radius: 4px; border: 1px solid #ccc; font-size: 11px; }
        .btn-toolbar { font-size: 11px; padding: 5px 10px; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; }
        .btn-delete { background: #fee2e2; color: #ef4444; }
        .btn-excel { background: #4CAF50; color: white; }

        /* Floating Sidebar on the RIGHT (Matching Python) */
        #resumo-container {
            position: fixed; top: 10px; right: 10px; width: 320px;
            background: white; border-radius: 10px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.25); z-index: 1000;
            max-height: calc(100vh - 20px); overflow: hidden; display: flex; flex-direction: column;
        }

        .sidebar-header { padding: 12px; background: #fff; border-bottom: 2px solid #4CAF50; }
        .sidebar-tabs { display: flex; background: #f8f8f8; border-bottom: 1px solid #eee; }
        .tab { flex: 1; text-align: center; padding: 8px; cursor: pointer; font-size: 11px; font-weight: bold; color: #666; transition: all 0.2s; }
        .tab.active { color: #4CAF50; background: white; border-bottom: 2px solid #4CAF50; }
        .tab:hover { background: #eee; }

        .sidebar-content { flex: 1; overflow-y: auto; padding: 10px; background: #fcfcfc; }
        
        .veiculo-card {
            margin-bottom: 10px; padding: 10px; background: white; border-radius: 6px;
            border: 1px solid #eee; border-left: 5px solid #ccc;
            box-shadow: 0 2px 4px rgba(0,0,0,0.05);
        }
        .v-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px; }
        .v-plate { font-weight: bold; font-size: 13px; }
        .v-stats { font-size: 11px; color: #666; display: flex; justify-content: space-between; margin-bottom: 5px; }
        .progress-container { background: #eee; border-radius: 3px; height: 12px; position: relative; overflow: hidden; }
        .progress-bar { height: 100%; text-align: right; padding-right: 5px; color: white; font-size: 9px; line-height: 12px; font-weight: bold; }
        
        .select-motorista { width: 100%; margin-top: 8px; padding: 4px; border-radius: 4px; border: 1px solid #ddd; font-size: 10px; color: #555; }

        .totais-footer { padding: 12px; background: #e8f5e8; border-top: 1px solid #4CAF5033; font-size: 11px; }
        .total-row { display: flex; justify-content: space-between; margin-bottom: 2px; }
        .total-val { font-weight: bold; color: #2E7D32; }

        /* Marker Sequence Label */
        .marker-label { background: transparent; border: none; box-shadow: none; color: white; font-weight: bold; font-size: 11px; pointer-events: none; }

        @media (max-width: 768px) {
            #toolbar { display: none; }
            #resumo-container { width: auto; left: 10px; right: 10px; top: auto; bottom: 10px; max-height: 40vh; }
        }
    </style>
</head>
<body>
    <div id="toolbar">
        <div class="toolbar-group">
            <span class="tool-icon" title="Editar">✏️</span>
            <span class="tool-icon" title="Marcador">📍</span>
            <span class="tool-icon" title="Régua">📏</span>
        </div>
        <div class="toolbar-group">
            <b id="toolbar-date-display">${todasDatas[0] || '---'}</b>
        </div>
        <div class="toolbar-group">
            <select class="toolbar-select" id="tool-vehicle-select" onchange="syncFilters()">
                <option value="TODOS">Veículos (${todasDatas[0] || '---'})</option>
                ${Object.keys(resumenVeiculos).map(p => `<option value="${p}">${p}</option>`).join('')}
            </select>
            <label style="display: flex; align-items: center; gap: 4px; font-size: 11px; cursor: pointer;">
                <input type="checkbox" checked onchange="toggleAllLayers(this.checked)"> Ver Tudo
            </label>
        </div>
        <div class="toolbar-group">
            <button class="btn-toolbar btn-delete" onclick="alert('Funcionalidade de exclusão desativada')">Deletar</button>
            <button class="btn-toolbar btn-excel" onclick="window.parent.postMessage({type: 'DOWNLOAD_EXCEL'}, '*')">Excel</button>
        </div>
    </div>

    <div id="resumo-container">
        <div class="sidebar-header">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <b style="font-size: 14px;">Resumo</b>
                <input type="checkbox" id="sidebar-toggle-check" checked onchange="toggleSidebarVisibility(this.checked)">
            </div>
            <div style="margin-top: 10px; display: grid; grid-template-columns: 1fr 1fr; gap: 5px;">
                <select id="sidebar-unit" class="toolbar-select" onchange="syncFilters()">
                    <option value="TODAS">Unidade</option>
                    ${todasUnidades.map(u => `<option value="${u}">${u}</option>`).join('')}
                </select>
                <select id="sidebar-date" class="toolbar-select" onchange="syncFilters()">
                    <option value="TODAS">Data</option>
                    ${todasDatas.map(u => `<option value="${u}">${u}</option>`).join('')}
                </select>
            </div>
        </div>
        <div class="sidebar-tabs">
            <div class="tab active" onclick="setTab('resumo')">Resumo</div>
            <div class="tab" onclick="setTab('placa')">Placa</div>
            <div class="tab" onclick="setTab('peso')">Peso</div>
            <div class="tab" onclick="setTab('prox')">Prox</div>
        </div>
        <div class="sidebar-content" id="lista-veiculos">
            <!-- Cards will be injected here -->
        </div>
        <div class="totais-footer">
            <div class="total-row"><span>🚚 Veículos:</span> <span class="total-val" id="t-veiculos">0</span></div>
            <div class="total-row"><span>📌 Pontos:</span> <span class="total-val" id="t-pontos">0</span></div>
            <div class="total-row"><span>⚖️ Peso:</span> <span class="total-val"><span id="t-peso">0</span>kg</span></div>
            <div class="total-row"><span>📊 Utilização:</span> <span class="total-val"><span id="t-util">0</span>%</span></div>
            <div class="total-row"><span>⏱️ Tempo:</span> <span class="total-val" id="t-tempo">00:00</span></div>
            <div class="total-row"><span>🛣️ Distância:</span> <span class="total-val"><span id="t-dist">0</span>km</span></div>
        </div>
    </div>

    <div id="map"></div>

    <script>
        const frota = ${JSON.stringify(resumenVeiculos)};
        const pontosRaw = ${JSON.stringify(filteredCalendarData)};
        const depots = ${JSON.stringify(depots || [])};

        let map = L.map('map', { zoomControl: false }).setView([${center[0]}, ${center[1]}], 12);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
        L.control.zoom({ position: 'bottomleft' }).addTo(map);

        let layerMarkers = L.layerGroup().addTo(map);
        let layerLines = L.layerGroup().addTo(map);

        function calcDist(p1, p2) {
            const R = 6371;
            const dLat = (p2[0]-p1[0]) * Math.PI / 180;
            const dLon = (p2[1]-p1[1]) * Math.PI / 180;
            const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                      Math.cos(p1[0]*Math.PI/180) * Math.cos(p2[0]*Math.PI/180) * 
                      Math.sin(dLon/2) * Math.sin(dLon/2);
            return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        }

        function formatTime(min) {
            const h = Math.floor(min / 60);
            const m = Math.floor(min % 60);
            return \`\${h.toString().padStart(2,'0')}:\${m.toString().padStart(2,'0')}\`;
        }

        function setTab(tab) {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            event.target.classList.add('active');
            // Logic for different tabs could be added if needed
        }

        function toggleSidebarVisibility(visible) {
            document.getElementById('resumo-container').style.height = visible ? 'auto' : '50px';
        }

        function toggleAllLayers(visible) {
            if (visible) { map.addLayer(layerMarkers); map.addLayer(layerLines); }
            else { map.removeLayer(layerMarkers); map.removeLayer(layerLines); }
        }

        function syncFilters() {
            const vSelect = document.getElementById('tool-vehicle-select').value;
            const unit = document.getElementById('sidebar-unit').value;
            const date = document.getElementById('sidebar-date').value;
            
            // Sync toolbar and sidebar filters if possible (date/vehicle)
            if (date !== 'TODAS') document.getElementById('toolbar-date-display').textContent = date;

            layerMarkers.clearLayers();
            layerLines.clearLayers();

            const renderList = [];
            let sumV=0, sumP=0, sumW=0, sumC=0, sumD=0, sumT=0;

            Object.values(frota).forEach(v => {
                const pts = pontosRaw.filter(p => 
                    p.Rota === v.placa && 
                    (unit === 'TODAS' || p.Unidade === unit) &&
                    (date === 'TODAS' || p.Data === date) &&
                    (vSelect === 'TODOS' || v.placa === vSelect)
                );

                if (pts.length > 0) {
                    sumV++;
                    const weight = pts.reduce((acc, p) => acc + (p.Media_Por_Coleta || 0), 0);
                    
                    let dist = 0;
                    if (depots.length > 0) {
                        let cur = [depots[0].latitude, depots[0].longitude];
                        pts.forEach(p => {
                            const next = [p.Latitude, p.Longitude];
                            dist += calcDist(cur, next);
                            cur = next;
                        });
                        dist += calcDist(cur, [depots[0].latitude, depots[0].longitude]);
                    }
                    
                    const tempo = (dist / 35 * 60) + (pts.length * 5);

                    sumP += pts.length;
                    sumW += weight;
                    sumC += v.capacidade;
                    sumD += dist;
                    sumT += tempo;

                    renderList.push({ ...v, curP: pts.length, curW: weight, curD: dist, curT: tempo, curU: (weight/v.capacidade*100) });

                    pts.forEach((p, idx) => {
                        const marker = L.circleMarker([p.Latitude, p.Longitude], {
                            radius: 12, fillColor: v.cor, color: "#fff", weight: 2, fillOpacity: 0.9
                        }).addTo(layerMarkers);
                        
                        marker.bindTooltip((idx+1).toString(), {
                            permanent: true, direction: 'center', className: 'marker-label'
                        }).openTooltip();
                        
                        marker.bindPopup(\`<b>\${p.Cliente}</b><br>\${p.Endereço}<br>Seq: \${idx+1}\`);
                    });

                    const coords = pts.map(p => [p.Latitude, p.Longitude]);
                    if (depots.length > 0) coords.unshift([depots[0].latitude, depots[0].longitude]);
                    L.polyline(coords, { color: v.cor, weight: 4, opacity: 0.5, dashArray: '5, 10' }).addTo(layerLines);
                }
            });

            document.getElementById('t-veiculos').textContent = sumV;
            document.getElementById('t-pontos').textContent = sumP;
            document.getElementById('t-peso').textContent = sumW.toFixed(1);
            document.getElementById('t-util').textContent = sumC > 0 ? (sumW/sumC*100).toFixed(1) : 0;
            document.getElementById('t-dist').textContent = sumD.toFixed(1);
            document.getElementById('t-tempo').textContent = formatTime(sumT);

            renderFleetCards(renderList);
            
            const bounds = [];
            renderList.forEach(v => pontosRaw.filter(p => p.Rota === v.placa && (date === 'TODAS' || p.Data === date)).forEach(p => bounds.push([p.Latitude, p.Longitude])));
            if (bounds.length > 0) map.fitBounds(bounds, { padding: [50, 50] });
        }

        function renderFleetCards(list) {
            const container = document.getElementById('lista-veiculos');
            container.innerHTML = '';
            list.forEach(v => {
                const progColor = v.curU >= 80 ? '#4CAF50' : v.curU >= 50 ? '#FF9800' : '#F44336';
                const card = document.createElement('div');
                card.className = 'veiculo-card';
                card.style.borderLeftColor = v.cor;
                card.innerHTML = \`
                    <div class="v-header">
                        <span class="v-plate" style="color:\${v.cor}">\${v.placa}</span>
                        <input type="checkbox" checked onchange="toggleVehicleLayer('\${v.placa}', this.checked)">
                    </div>
                    <div class="v-stats">
                        <span>📍 \${v.curP} pts</span>
                        <span>🛣️ \${v.curD.toFixed(1)}km</span>
                        <span>⏱️ \${formatTime(v.curT)}</span>
                    </div>
                    <div class="v-stats">
                        <span>⚖️ \${v.curW.toFixed(1)}kg</span>
                        <span>📅 \${pontosRaw.find(p => p.Rota === v.placa)?.Data || ''}</span>
                    </div>
                    <div class="progress-container">
                        <div class="progress-bar" style="width:\${Math.min(v.curU, 100)}%; background:\${progColor}">
                            \${v.curU.toFixed(1)}%
                        </div>
                    </div>
                    <select class="select-motorista">
                        <option>-- Selecionar Motorista --</option>
                        <option>Motorista A</option>
                        <option>Motorista B</option>
                    </select>
                \`;
                container.appendChild(card);
            });
        }

        function toggleVehicleLayer(placa, visible) {
            // This would need more granularity if we want to hide individual vehicles
            // For now, let's keep it simple as the SyncFilters handles everything.
        }

        // Draw Depots
        depots.forEach(d => {
            L.marker([d.latitude, d.longitude], {
                icon: L.divIcon({
                    html: '<div style="background: #d32f2f; width: 34px; height: 34px; border-radius: 50%; border: 3px solid white; display: flex; align-items: center; justify-content: center; color: white; box-shadow: 0 2px 8px rgba(0,0,0,0.4); font-size: 16px;">🏠</div>',
                    iconSize: [34, 34], iconAnchor: [17, 17]
                })
            }).addTo(map).bindPopup("🏭 DEPÓSITO: " + (d.unit_name || d.name));
        });

        syncFilters();
    </script>
</body>
</html>
`;

        return res.status(200).json({ html, totalPoints: filteredCalendarData.length });

    } catch (error: any) {
        console.error('API Error:', error);
        return res.status(500).json({ error: error.message });
    }
}
