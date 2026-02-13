import pandas as pd
import os
from datetime import datetime, date, timedelta
import re
from collections import defaultdict
import locale
from dateutil.relativedelta import relativedelta

# Configurar a localização para português do Brasil
try:
    locale.setlocale(locale.LC_ALL, 'pt_BR.UTF-8')
except:
    try:
        locale.setlocale(locale.LC_ALL, 'Portuguese_Brazil.1252')
    except:
        print("Aviso: Não foi possível configurar a localização para português")

# Mapeamento de números para nomes dos dias em português
NOMES_DIAS = {
    0: 'SEG',
    1: 'TER', 
    2: 'QUA',
    3: 'QUI',
    4: 'SEX',
    5: 'SAB',
    6: 'DOM'
}

# Mapeamento de nomes de dias da semana para números
dia_para_numero = {
    'SEG': 0, 'SEGUNDA': 0, 'SEGUNDA-FEIRA': 0, '2A': 0, '2ª': 0,
    'TER': 1, 'TERCA': 1, 'TERÇA': 1, 'TERCA-FEIRA': 1, 'TERÇA-FEIRA': 1, '3A': 1, '3ª': 1,
    'QUA': 2, 'QUARTA': 2, 'QUARTA-FEIRA': 2, '4A': 2, '4ª': 2,
    'QUI': 3, 'QUINTA': 3, 'QUINTA-FEIRA': 3, '5A': 3, '5ª': 3,
    'SEX': 4, 'SEXTA': 4, 'SEXTA-FEIRA': 4, '6A': 4, '6ª': 4,
    'SAB': 5, 'SABADO': 5, 'SÁBADO': 5, 'SAB': 5,
    'DOM': 6, 'DOMINGO': 6, 'DOMINGOS': 6
}

# Função para obter o dia da semana em português
def obter_dia_semana_ptbr(data):
    """Retorna o dia da semana em português (abreviado) a partir de um objeto datetime."""
    return NOMES_DIAS[data.weekday()]

def encontrar_ocorrencia_dia_mes(ano, mes, dia_semana_num, ocorrencia):
    """
    Encontra a enésima ocorrência de um dia da semana no mês.
    """
    # Primeiro dia do mês
    primeiro_dia = date(ano, mes, 1)
    
    # Encontrar o primeiro dia da semana no mês
    delta = (dia_semana_num - primeiro_dia.weekday()) % 7
    primeiro_dia_semana = primeiro_dia + timedelta(days=delta)
    
    # Calcular a data da ocorrência desejada
    data_ocorrencia = primeiro_dia_semana + timedelta(weeks=ocorrencia-1)
    
    # Verificar se a data está no mesmo mês
    if data_ocorrencia.month == mes:
        return data_ocorrencia
    
    return None

def encontrar_ultima_ocorrencia_dia_mes(ano, mes, dia_semana_num):
    """
    Encontra a última ocorrência de um dia da semana no mês.
    """
    # Último dia do mês
    if mes == 12:
        ultimo_dia = date(ano + 1, 1, 1) - timedelta(days=1)
    else:
        ultimo_dia = date(ano, mes + 1, 1) - timedelta(days=1)
    
    # Encontrar o último dia da semana no mês
    delta = (dia_semana_num - ultimo_dia.weekday()) % 7
    if delta > 0:
        delta -= 7
    
    ultima_ocorrencia = ultimo_dia + timedelta(days=delta)
    return ultima_ocorrencia

def processar_coordenadas(coord_str):
    """Processa uma string de coordenadas e retorna (latitude, longitude) como floats."""
    if pd.isna(coord_str) or not isinstance(coord_str, str) or not coord_str.strip():
        return None, None
    
    try:
        parts = [p.strip() for p in coord_str.split(',') if p.strip()]
        if len(parts) >= 2:
            lat_str, lon_str = parts[0], parts[1]
            lat_str = ''.join(c for c in lat_str if c.isdigit() or c in '.-')
            lon_str = ''.join(c for c in lon_str if c.isdigit() or c in '.-')
            
            if lat_str and lon_str:
                lat = float(lat_str)
                lon = float(lon_str)
                if -34 < lat < 6 and -74 < lon < -30:
                    return lat, lon
    except (ValueError, TypeError):
        pass
    
    return None, None

def carregar_dados(arquivo_entrada):
    """Carrega e processa o arquivo de entrada."""
    print(f"Carregando dados de: {arquivo_entrada}")
    
    df = pd.read_excel(arquivo_entrada)
    
    print("\nColunas disponíveis no arquivo:")
    for i, col in enumerate(df.columns, 1):
        print(f"{i}. {col}")
    
    colunas_obrigatorias = ['Rota', 'Periodicidade', 'Endereço', 'Cidade']
    for col in colunas_obrigatorias:
        if col not in df.columns:
            print(f"\nAVISO: Coluna obrigatória '{col}' não encontrada no arquivo.")
    
    coluna_apelido = None
    for col in df.columns:
        if 'apelido' in str(col).lower() or 'cliente' in str(col).lower():
            coluna_apelido = col
            print(f"\nColuna de apelido/cliente identificada: '{col}'")
            break
    
    if not coluna_apelido:
        print("\nAVISO: Nenhuma coluna de apelido/cliente identificada. Usando 'N/I'.")
        df['Apelido'] = 'N/I'
        coluna_apelido = 'Apelido'
    
    print("\nProcessando coordenadas...")
    coordenadas_validas = 0
    sem_coordenadas = 0
    
    df['Latitude'] = None
    df['Longitude'] = None
    
    coluna_coordenadas = None
    for col in df.columns:
        col_lower = str(col).lower()
        if ('latitude' in col_lower and 'longitude' in col_lower) or 'coordenada' in col_lower:
            coluna_coordenadas = col
            print(f"  - Coluna de coordenadas identificada: '{col}'")
            break
    
    if coluna_coordenadas:
        for idx, coord_str in enumerate(df[coluna_coordenadas]):
            lat, lon = processar_coordenadas(coord_str)
            if lat is not None and lon is not None:
                df.at[idx, 'Latitude'] = lat
                df.at[idx, 'Longitude'] = lon
                coordenadas_validas += 1
            else:
                sem_coordenadas += 1
    
    print(f"  - Total de registros: {len(df)}")
    print(f"  - Coordenadas válidas: {coordenadas_validas} ({(coordenadas_validas/len(df))*100:.1f}%)")
    print(f"  - Sem coordenadas: {sem_coordenadas} ({(sem_coordenadas/len(df))*100:.1f}%)")
    
    return df, coluna_apelido

def extrair_dias_semana_detalhado(periodicidade):
    """
    Extrai os dias da semana de uma string de periodicidade de forma mais robusta.
    Retorna lista de números dos dias da semana.
    """
    periodicidade_upper = periodicidade.upper()
    dias_numericos = []
    
    mapa_dias = {
        'SEGUNDA': 0, 'SEG': 0, '2A': 0, '2ª': 0,
        'TERCA': 1, 'TERÇA': 1, 'TER': 1, '3A': 1, '3ª': 1,
        'QUARTA': 2, 'QUA': 2, '4A': 2, '4ª': 2,
        'QUINTA': 3, 'QUI': 3, '5A': 3, '5ª': 3,
        'SEXTA': 4, 'SEX': 4, '6A': 4, '6ª': 4,
        'SABADO': 5, 'SÁBADO': 5, 'SAB': 5, 'SÁB': 5,
        'DOMINGO': 6, 'DOM': 6
    }
    
    # Padrões complexos com múltiplos dias
    padroes_complexos = [
        (r'SEGUNDA.*SEXTA', [0, 1, 2, 3, 4]),
        (r'SEGUNDA.*SABADO', [0, 1, 2, 3, 4, 5]),
        (r'SEGUNDA.*DOMINGO', [0, 1, 2, 3, 4, 5, 6]),
        (r'SEGUNDA.*QUARTA.*SEXTA', [0, 2, 4]),
        (r'SEGUNDA.*QUINTA', [0, 3]),
        (r'TERCA.*QUINTA', [1, 3]),
        (r'TERCA.*SEXTA', [1, 4]),
        (r'QUARTA.*SEXTA', [2, 4]),
    ]
    
    # Verificar padrões complexos primeiro
    for padrao, dias in padroes_complexos:
        if re.search(padrao, periodicidade_upper):
            dias_numericos.extend(dias)
            break
    
    # Se não encontrou padrão complexo, procurar por dias individuais
    if not dias_numericos:
        for dia_nome, dia_num in mapa_dias.items():
            if dia_nome in periodicidade_upper:
                if dia_num not in dias_numericos:
                    dias_numericos.append(dia_num)
    
    # Verificar padrões com vírgulas e "E"
    if not dias_numericos:
        padrao_virgulas = r'(SEGUNDA|TERÇA|TERCA|QUARTA|QUINTA|SEXTA|SÁBADO|SABADO|DOMINGO)[\s,]*E?[\s,]*(SEGUNDA|TERÇA|TERCA|QUARTA|QUINTA|SEXTA|SÁBADO|SABADO|DOMINGO)?[\s,]*E?[\s,]*(SEGUNDA|TERÇA|TERCA|QUARTA|QUINTA|SEXTA|SÁBADO|SABADO|DOMINGO)?'
        matches = re.findall(padrao_virgulas, periodicidade_upper)
        for match in matches:
            for dia in match:
                if dia and dia in mapa_dias:
                    if mapa_dias[dia] not in dias_numericos:
                        dias_numericos.append(mapa_dias[dia])
    
    # Fallback: se não encontrou nada, usar segunda a sexta
    if not dias_numericos:
        if 'DIARIO' in periodicidade_upper or 'DIÁRIO' in periodicidade_upper:
            dias_numericos = [0, 1, 2, 3, 4, 5, 6]
        else:
            dias_numericos = [0, 1, 2, 3, 4]
    
    return sorted(list(set(dias_numericos)))

def extrair_ocorrencias_mensais(periodicidade):
    """Extrai ocorrências (1º, 2º, 3º, 4º) de padrões mensais."""
    periodicidade_upper = periodicidade.upper()
    
    # Padrão para ocorrências específicas
    padrao_ocorrencia = r'(\d+)[ºª]?\s*([A-Z]{3,})'
    matches = re.findall(padrao_ocorrencia, periodicidade_upper)
    
    ocorrencias = []
    for match in matches:
        try:
            ocorrencia_num = int(match[0])
            dia_nome = match[1]
            ocorrencias.append((ocorrencia_num, dia_nome))
        except (ValueError, IndexError):
            continue
    
    return ocorrencias

def gerar_datas_coleta(periodicidade, year=None, month=None):
    """
    Gera as datas de coleta com base na periodicidade.
    """
    if year is None:
        year = datetime.now().year
    if month is None:
        month = datetime.now().month
    
    primeiro_dia = date(year, month, 1)
    if month == 12:
        ultimo_dia = date(year + 1, 1, 1) - timedelta(days=1)
    else:
        ultimo_dia = date(year, month + 1, 1) - timedelta(days=1)
    
    datas_coleta = []
    periodicidade_upper = str(periodicidade).upper().strip()
    
    print(f"  Processando: {periodicidade_upper}")

    # Mapeamento de dias da semana
    dias_semana_map = {
        'SEGUNDA': 0, 'SEG': 0, '2A': 0, '2ª': 0,
        'TERCA': 1, 'TERÇA': 1, 'TER': 1, '3A': 1, '3ª': 1,
        'QUARTA': 2, 'QUA': 2, '4A': 2, '4ª': 2,
        'QUINTA': 3, 'QUI': 3, '5A': 3, '5ª': 3,
        'SEXTA': 4, 'SEX': 4, '6A': 4, '6ª': 4,
        'SABADO': 5, 'SÁBADO': 5, 'SAB': 5, 'SÁB': 5,
        'DOMINGO': 6, 'DOM': 6
    }

    # 1. PERIODICIDADE MENSAL
    if 'MEN' in periodicidade_upper or 'MENSAL' in periodicidade_upper:
        print("    Tipo: Mensal")
        
        # Verificar se é última ocorrência
        if 'ULTIMA' in periodicidade_upper or 'ÚLTIMA' in periodicidade_upper:
            dias_numericos = extrair_dias_semana_detalhado(periodicidade_upper)
            for dia_num in dias_numericos:
                data_coleta = encontrar_ultima_ocorrencia_dia_mes(year, month, dia_num)
                if data_coleta:
                    dia_semana_abrev = obter_dia_semana_ptbr(data_coleta)
                    datas_coleta.append((data_coleta.strftime('%d/%m/%Y'), dia_semana_abrev))
                    print(f"    Última {NOMES_DIAS[dia_num]}: {data_coleta.strftime('%d/%m/%Y')}")
        
        # Verificar ocorrências específicas (1º, 2º, 3º, 4º)
        else:
            ocorrencias = extrair_ocorrencias_mensais(periodicidade_upper)
            for ocorrencia_num, dia_nome in ocorrencias:
                if dia_nome in dias_semana_map:
                    dia_num = dias_semana_map[dia_nome]
                    data_coleta = encontrar_ocorrencia_dia_mes(year, month, dia_num, ocorrencia_num)
                    if data_coleta:
                        dia_semana_abrev = obter_dia_semana_ptbr(data_coleta)
                        datas_coleta.append((data_coleta.strftime('%d/%m/%Y'), dia_semana_abrev))
                        print(f"    {ocorrencia_num}ª {dia_nome}: {data_coleta.strftime('%d/%m/%Y')}")
        
        # Se não encontrou nenhuma data, usar primeiro dia do mês
        if not datas_coleta:
            dia_semana_abrev = obter_dia_semana_ptbr(primeiro_dia)
            datas_coleta.append((primeiro_dia.strftime('%d/%m/%Y'), dia_semana_abrev))
            print(f"    Mensal padrão: {primeiro_dia.strftime('%d/%m/%Y')}")

    # 2. PERIODICIDADE QUINZENAL
    elif 'QZ' in periodicidade_upper or 'QUINZENAL' in periodicidade_upper:
        print("    Tipo: Quinzenal")
        
        # Padrão para quinzenal com ocorrências específicas
        padrao_quinzenal = r'(\d+)[ºª]?\s*E\s*(\d+)[ºª]?\s*([A-Z]{3,})'
        match = re.search(padrao_quinzenal, periodicidade_upper)
        
        if match:
            try:
                ocorrencia1 = int(match.group(1))
                ocorrencia2 = int(match.group(2))
                dia_nome = match.group(3)
                
                if dia_nome in dias_semana_map:
                    dia_num = dias_semana_map[dia_nome]
                    
                    for ocorrencia in [ocorrencia1, ocorrencia2]:
                        data_coleta = encontrar_ocorrencia_dia_mes(year, month, dia_num, ocorrencia)
                        if data_coleta:
                            dia_semana_abrev = obter_dia_semana_ptbr(data_coleta)
                            datas_coleta.append((data_coleta.strftime('%d/%m/%Y'), dia_semana_abrev))
                            print(f"    Quinzenal {ocorrencia}ª {dia_nome}: {data_coleta.strftime('%d/%m/%Y')}")
            except (ValueError, IndexError):
                pass
        
        # Se não encontrou padrão específico, usar 1ª e 3ª do mês
        if not datas_coleta:
            dias_numericos = extrair_dias_semana_detalhado(periodicidade_upper)
            for dia_num in dias_numericos:
                for ocorrencia in [1, 3]:
                    data_coleta = encontrar_ocorrencia_dia_mes(year, month, dia_num, ocorrencia)
                    if data_coleta:
                        dia_semana_abrev = obter_dia_semana_ptbr(data_coleta)
                        datas_coleta.append((data_coleta.strftime('%d/%m/%Y'), dia_semana_abrev))
                        print(f"    Quinzenal padrão {ocorrencia}ª {NOMES_DIAS[dia_num]}: {data_coleta.strftime('%d/%m/%Y')}")

    # 3. PERIODICIDADE SEMANAL
    elif any(x in periodicidade_upper for x in ['SEM', 'SEMANAL', 'SEMANA', 'VEZES']):
        print("    Tipo: Semanal")
        
        dias_numericos = extrair_dias_semana_detalhado(periodicidade_upper)
        print(f"    Dias encontrados: {[NOMES_DIAS[d] for d in dias_numericos]}")
        
        # Verificar semanas específicas (ex: SEMANA 1,2 E 4)
        semanas_especificas = None
        padrao_semanas = re.search(r'SEMANA\s*([0-9,\sE]+)', periodicidade_upper)
        if padrao_semanas:
            semanas_str = padrao_semanas.group(1)
            semanas_especificas = []
            for parte in re.split(r'[,\sE]+', semanas_str):
                if parte.isdigit():
                    semanas_especificas.append(int(parte))
            print(f"    Semanas específicas: {semanas_especificas}")
        
        # Gerar datas
        data_atual = primeiro_dia
        while data_atual <= ultimo_dia:
            if data_atual.weekday() in dias_numericos:
                if semanas_especificas:
                    semana_do_mes = (data_atual.day - 1) // 7 + 1
                    if semana_do_mes in semanas_especificas:
                        dia_semana_abrev = obter_dia_semana_ptbr(data_atual)
                        datas_coleta.append((data_atual.strftime('%d/%m/%Y'), dia_semana_abrev))
                else:
                    dia_semana_abrev = obter_dia_semana_ptbr(data_atual)
                    datas_coleta.append((data_atual.strftime('%d/%m/%Y'), dia_semana_abrev))
            
            data_atual += timedelta(days=1)

    # 4. PERIODICIDADE DIÁRIA
    elif 'DIA' in periodicidade_upper or 'DIÁRIO' in periodicidade_upper or 'DIARIO' in periodicidade_upper:
        print("    Tipo: Diário")
        
        dias_numericos = extrair_dias_semana_detalhado(periodicidade_upper)
        
        data_atual = primeiro_dia
        while data_atual <= ultimo_dia:
            if data_atual.weekday() in dias_numericos:
                dia_semana_abrev = obter_dia_semana_ptbr(data_atual)
                datas_coleta.append((data_atual.strftime('%d/%m/%Y'), dia_semana_abrev))
            
            data_atual += timedelta(days=1)

    # 5. PERIODICIDADE BIMESTRAL
    elif 'BIM' in periodicidade_upper or 'BIMESTRAL' in periodicidade_upper:
        print("    Tipo: Bimestral")
        
        # Para bimestral, verificar se este mês é par ou ímpar
        mes_base = month if month % 2 == 1 else month - 1  # Usar meses ímpares como base
        
        if month == mes_base:  # Apenas gerar nos meses base
            ocorrencias = extrair_ocorrencias_mensais(periodicidade_upper)
            for ocorrencia_num, dia_nome in ocorrencias:
                if dia_nome in dias_semana_map:
                    dia_num = dias_semana_map[dia_nome]
                    data_coleta = encontrar_ocorrencia_dia_mes(year, month, dia_num, ocorrencia_num)
                    if data_coleta:
                        dia_semana_abrev = obter_dia_semana_ptbr(data_coleta)
                        datas_coleta.append((data_coleta.strftime('%d/%m/%Y'), dia_semana_abrev))
                        print(f"    Bimestral {ocorrencia_num}ª {dia_nome}: {data_coleta.strftime('%d/%m/%Y')}")

    # 6. PERIODICIDADE TRIMESTRAL  
    elif 'TRI' in periodicidade_upper or 'TRIMESTRAL' in periodicidade_upper:
        print("    Tipo: Trimestral")
        
        # Para trimestral, gerar apenas nos meses 1, 4, 7, 10
        meses_trimestrais = [1, 4, 7, 10]
        if month in meses_trimestrais:
            # Usar mesma lógica da mensal
            ocorrencias = extrair_ocorrencias_mensais(periodicidade_upper)
            for ocorrencia_num, dia_nome in ocorrencias:
                if dia_nome in dias_semana_map:
                    dia_num = dias_semana_map[dia_nome]
                    data_coleta = encontrar_ocorrencia_dia_mes(year, month, dia_num, ocorrencia_num)
                    if data_coleta:
                        dia_semana_abrev = obter_dia_semana_ptbr(data_coleta)
                        datas_coleta.append((data_coleta.strftime('%d/%m/%Y'), dia_semana_abrev))
                        print(f"    Trimestral {ocorrencia_num}ª {dia_nome}: {data_coleta.strftime('%d/%m/%Y')}")

    # 7. PERIODICIDADE NÃO RECONHECIDA - TENTAR INFERIR
    else:
        print("    Tipo: Não reconhecido - tentando inferir")
        
        dias_numericos = extrair_dias_semana_detalhado(periodicidade_upper)
        
        if dias_numericos:
            data_atual = primeiro_dia
            while data_atual <= ultimo_dia:
                if data_atual.weekday() in dias_numericos:
                    dia_semana_abrev = obter_dia_semana_ptbr(data_atual)
                    datas_coleta.append((data_atual.strftime('%d/%m/%Y'), dia_semana_abrev))
                
                data_atual += timedelta(days=1)
        
        # Fallback
        if not datas_coleta:
            dia_semana_abrev = obter_dia_semana_ptbr(primeiro_dia)
            datas_coleta.append((primeiro_dia.strftime('%d/%m/%Y'), dia_semana_abrev))

    print(f"    Total de datas geradas: {len(datas_coleta)}")
    return datas_coleta

def gerar_calendario_por_rota(df, coluna_apelido, year=None, month=None):
    """Gera o calendário de coletas agrupado por rota."""
    if year is None:
        year = datetime.now().year
    if month is None:
        month = datetime.now().month
    
    print(f"\nGerando calendário para {month}/{year}...")
    
    rotas = {}
    todas_as_coletas = []
    
    for idx, row in df.iterrows():
        rota = row.get('Rota', 'NÃO INFORMADA')
        periodicidade = row.get('Periodicidade', 'NÃO INFORMADA')
        apelido = row.get(coluna_apelido, 'N/I')
        endereco = row.get('Endereço', '')
        cidade = row.get('Cidade', '')
        bairro = row.get('Bairro', '')
        unidade = row.get('Unidade', '')
        latitude = row.get('Latitude')
        longitude = row.get('Longitude')
        
        try:
            if pd.notna(latitude) and str(latitude).strip() not in ['', 'nan', 'None', 'SAB']:
                latitude = float(latitude)
            else:
                latitude = None
        except (ValueError, TypeError):
            latitude = None
            
        try:
            if pd.notna(longitude) and str(longitude).strip() not in ['', 'nan', 'None', 'SAB']:
                longitude = float(longitude)
            else:
                longitude = None
        except (ValueError, TypeError):
            longitude = None
        
        media_por_coleta = 0.0
        if 'Media Por Coleta' in df.columns:
            media_str = row.get('Media Por Coleta')
            try:
                media_por_coleta = float(media_str) if pd.notna(media_str) else 0.0
            except (ValueError, TypeError):
                media_por_coleta = 0.0
        
        print(f"\nProcessando: {apelido}")
        print(f"- Rota: {rota}")
        print(f"- Periodicidade: {periodicidade}")
        
        datas_coleta = gerar_datas_coleta(periodicidade, year, month)
        print(f"  - Datas de coleta: {', '.join([d[0] for d in datas_coleta])}")
        
        for data_coleta, dia_semana in datas_coleta:
            registro_rota = {
                'Data': data_coleta,
                'Dia_Semana': dia_semana,
                'Rota': rota,
                'Unidade': unidade,
                'Cliente': apelido,
                'Vetor_Custo_Nome': row.get('Vetor de custo nome', row.get('cost_vector_name', '')),
                'Endereço': endereco,
                'Cidade': cidade,
                'Bairro': bairro,
                'Periodicidade': periodicidade,
                'Media_Por_Coleta': media_por_coleta,
                'Latitude': latitude,
                'Longitude': longitude
            }
            
            todas_as_coletas.append(registro_rota)
            
            if rota not in rotas:
                rotas[rota] = []
            rotas[rota].append(registro_rota)
    
    return rotas, todas_as_coletas

def limpar_nome_planilha(nome):
    """Remove caracteres inválidos do nome da planilha."""
    caracteres_invalidos = ['\\', '/', '?', '*', ':', '[', ']']
    for char in caracteres_invalidos:
        nome = nome.replace(char, '')
    if len(nome) > 31:
        nome = nome[:31]
    return nome

def salvar_arquivo(rotas, todas_as_coletas, arquivo_saida):
    """Salva as rotas em um arquivo Excel."""
    print(f"\nSalvando arquivo de saída: {arquivo_saida}")
    
    os.makedirs(os.path.dirname(arquivo_saida), exist_ok=True)
    
    with pd.ExcelWriter(arquivo_saida, engine='xlsxwriter') as writer:
        if todas_as_coletas:
            print("Criando planilha consolidada...")
            df_todas = pd.DataFrame(todas_as_coletas)
            
            if 'Data' in df_todas.columns and 'Rota' in df_todas.columns:
                df_todas = df_todas.sort_values(['Data', 'Rota'])
            
            df_todas['Latitude'] = pd.to_numeric(df_todas['Latitude'], errors='coerce')
            df_todas['Longitude'] = pd.to_numeric(df_todas['Longitude'], errors='coerce')
            
            colunas_ordenadas = [
                'Data', 'Dia_Semana', 'Rota', 'Unidade', 'Cliente', 'Vetor_Custo_Nome', 'Endereço', 
                'Cidade', 'Bairro', 'Periodicidade', 'Media_Por_Coleta', 
                'Latitude', 'Longitude'
            ]
            
            colunas_finais = [col for col in colunas_ordenadas if col in df_todas.columns]
            colunas_restantes = [col for col in df_todas.columns if col not in colunas_ordenadas]
            colunas_finais.extend(colunas_restantes)
            
            df_todas = df_todas[colunas_finais]
            df_todas.to_excel(writer, sheet_name='TODAS_AS_ROTAS', index=False)
            print(f"Planilha consolidada criada com {len(df_todas)} registros")
        
        print("\nCriando resumo de rotas...")
        resumo = []
        for rota, coletas in rotas.items():
            if coletas:
                primeira_data = min(coleta['Data'] for coleta in coletas)
                ultima_data = max(coleta['Data'] for coleta in coletas)
                total_coletas = len(coletas)
                clientes_unicos = len(set(coleta['Cliente'] for coleta in coletas))
                
                resumo.append({
                    'Rota': rota,
                    'Primeira Data': primeira_data,
                    'Última Data': ultima_data,
                    'Total de Coletas': total_coletas,
                    'Clientes Únicos': clientes_unicos
                })
        
        if resumo:
            df_resumo = pd.DataFrame(resumo)
            df_resumo = df_resumo.sort_values('Rota')
            df_resumo.to_excel(writer, sheet_name='RESUMO_ROTAS', index=False)
            print(f"Resumo de {len(resumo)} rotas criado com sucesso!")
        
        for rota, coletas in rotas.items():
            if coletas:
                df_rota = pd.DataFrame(coletas)
                df_rota = df_rota.sort_values(['Data', 'Cliente'])
                nome_planilha = limpar_nome_planilha(rota)
                
                try:
                    df_rota.to_excel(writer, sheet_name=nome_planilha, index=False)
                    print(f"Salvando planilha: {nome_planilha} ({len(df_rota)} registros)")
                except Exception as e:
                    print(f"  ERRO ao salvar planilha {nome_planilha}: {str(e)}")
    
    print(f"\nArquivo salvo com sucesso em: {arquivo_saida}")
    if os.path.exists(arquivo_saida):
        print(f"Tamanho do arquivo: {os.path.getsize(arquivo_saida) / (1024 * 1024):.2f} MB")

def main():
    """Função principal."""
    try:
        diretorio_entrada = 'dados_entrada'
        if not os.path.exists(diretorio_entrada):
            os.makedirs(diretorio_entrada)
            print(f"Diretório '{diretorio_entrada}' criado. Por favor, coloque o arquivo 'Pontos_Coletas.xlsx' nele.")
            return
        
        arquivo_entrada = os.path.join(diretorio_entrada, 'Pontos_Coletas.xlsx')
        if not os.path.isfile(arquivo_entrada):
            print(f"ERRO: Arquivo 'Pontos_Coletas.xlsx' não encontrado no diretório '{diretorio_entrada}'.")
            return
        
        df, coluna_apelido = carregar_dados(arquivo_entrada)
        
        mes_atual = datetime.now().month
        ano_atual = datetime.now().year
        
        print(f"\nIniciando geração do calendário para {mes_atual}/{ano_atual}")
        
        rotas, todas_as_coletas = gerar_calendario_por_rota(df, coluna_apelido, ano_atual, mes_atual)
        
        diretorio_saida = 'dados_saida'
        os.makedirs(diretorio_saida, exist_ok=True)
        
        data_hora = datetime.now().strftime('%Y%m%d_%H%M%S')
        arquivo_saida = os.path.join(diretorio_saida, f'Calendario_Rotas_{data_hora}.xlsx')
        
        salvar_arquivo(rotas, todas_as_coletas, arquivo_saida)
        
        print("\nProcesso concluído com sucesso!")
        print(f"Arquivo gerado: {os.path.abspath(arquivo_saida)}")
        
    except Exception as e:
        print(f"\nERRO: {str(e)}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()