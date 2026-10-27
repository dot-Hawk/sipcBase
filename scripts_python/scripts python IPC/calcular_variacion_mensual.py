# -*- coding: utf-8 -*-
"""
Created on Thu Nov  4 11:13:44 2021

@author: Usuario
"""

import pandas as pd
import os
from datetime import datetime as dt
import locale
locale.setlocale(locale.LC_ALL, 'esp_esp')
#%%

def calcular_variacion_mensual(nombre_mes_base, dir_bases='Series_precios', dir_var='Series_variaciones', guardar=True):
    # nombre_mes_base = 'SEPTIEMBRE_2020.xlsx'  'AGOSTO_2021.xlsx''JULIO_2021'
    import os
    path = './'
    archivo = os.path.join(path, dir_bases, nombre_mes_base)
    df_precios = pd.read_excel(archivo, sheet_name="Precios utilizados") #Imputados
    
    #Separo del DataFrame a las variedades con tratamiento especial. Luego del proceso agrego la lista
    tratamiento_especial = pd.read_excel('./recursos/TRATAMIENTO_ESPECIAL.xlsx', header=None, usecols='A')[0].tolist()

    df_especial = df_precios[df_precios.VARIEDAD.isin(tratamiento_especial)]
    df_precios = df_precios[~df_precios.VARIEDAD.isin(tratamiento_especial)].copy()
    
    
    
    try:
        df_var = pd.read_excel(os.path.join(path, dir_var, nombre_mes_base)) #Imputados
        meses_calculados = len(df_var.columns[4:])
    
    except FileNotFoundError:
        #si el archivo no está lo tengo que crear
        meses_calculados = 0
        
        df_var = armar_base_variedades(df_precios)
        # df_var = pd.DataFrame(df_precios['VARIEDAD'].unique(), columns=['VARIEDAD'])
        
        # #Agrego los ponderadores
        # ponderadores = pd.read_excel('./recursos/PONDERADORES.xlsx', usecols='A,B,C,D', index_col=0)
        # df_var.insert(1, 'Ponderador', df_var.apply(lambda x: ponderadores.loc[x['VARIEDAD'], 'Ponderador'], axis=1))
        # df_var.insert(1, 'NOMBRE', df_var.apply(lambda x: ponderadores.loc[x['VARIEDAD'], 'Variedad'], axis=1))
        
        # #y la nueva clasificación
        # dicc_variedades = pd.read_excel('./recursos/DICCIONARIO_VARIEDADES.xlsx', usecols='A,B', index_col=0)
        # df_var.insert(1, 'VARIEDAD_12', df_var.apply(lambda x: dicc_variedades.loc[x['VARIEDAD']], axis=1))
    
    
    meses_a_calcular = df_precios.columns[5+ meses_calculados : ]
    
    if len(meses_a_calcular) == 0:
        print('Noy hay meses pendientes de cálculo')
        
    else:
        print(f'Faltan calcular {len(meses_a_calcular)} meses en la serie de variaciones')
        for mes in meses_a_calcular:
            # mes = '2021-08'
            df_a_incorporar = calcular_columna(df_precios, mes)
            df_var = pd.merge(df_var, df_a_incorporar)
            
            # #Reestablezco los precios a los que se les aplicaron cambio de calidad 
            # date_i = dt.strptime(mes, '%Y-%m').date()
            # str_mes = date_i.strftime("%B_%Y").upper() + '.xlsx'
            # archivo_mes = os.path.join(path, 'Bases_limpias_precios', str_mes)
        
            # df_cc = pd.read_excel(archivo_mes, sheet_name="Camb.Calidad")
    
    df_especial = armar_base_variedades(df_especial)
    df_var = pd.concat([df_var, df_especial])    
        
    
        
    if guardar:
    
        from pathlib import Path
        mk_path=Path(dir_var)
        mk_path.mkdir(parents=True, exist_ok=True)    
    
        with pd.ExcelWriter(os.path.join(path, dir_var, nombre_mes_base)) as writer:
            # df_precios.to_excel(writer, sheet_name="Precios utilizados", index=False, merge_cells=False)            
            # df_base.to_excel(writer, sheet_name="Precios", index=False, merge_cells=False)
            df_var.to_excel(writer, sheet_name="Variaciones", index=False, merge_cells=False)
            writer.save()
            
        '''Aca modifica la fecha de creacion del archivo al MES-AÑO de referencia.
        Esto permite que al ordenar por fecha o por nombre se logren agrupamientos mensuales
        o anuales
        '''
        from datetime import datetime as dt
        
        date = dt.strptime(nombre_mes_base[:-10]+'-'+nombre_mes_base[-9:-5], '%B-%Y')
        archivo_salida = os.path.join(path, 'Series_precios', nombre_mes_base)
        os.utime(archivo_salida, (date.timestamp(),date.timestamp()))
        from win32_setctime import setctime
        setctime(archivo_salida, date.timestamp())

    return df_var

#%%
def armar_base_variedades(data_frame):
    # data_frame = df_precios
    df_var = pd.DataFrame(data_frame['VARIEDAD'].unique(), columns=['VARIEDAD'])
    
    #Agrego los ponderadores
    ponderadores = pd.read_excel('./recursos/PONDERADORES.xlsx', usecols='A,B,C,D', index_col=0)
    df_var.insert(1, 'Ponderador', df_var.apply(lambda x: ponderadores.loc[x['VARIEDAD'], 'Ponderador'], axis=1))
    df_var.insert(1, 'NOMBRE', df_var.apply(lambda x: ponderadores.loc[x['VARIEDAD'], 'Variedad'], axis=1))
    
    #y la nueva clasificación
    dicc_variedades = pd.read_excel('./recursos/DICCIONARIO_VARIEDADES.xlsx', usecols='A,B', index_col=0)
    df_var.insert(1, 'VARIEDAD_12', df_var.apply(lambda x: dicc_variedades.loc[x['VARIEDAD']], axis=1)['VARIEDAD_12'].tolist())
    
    return df_var

#%%
def calcular_columna(df_precios, columna):
    # columna = meses_a_calcular[0]
    df = df_precios[df_precios.columns[:4].tolist() + [df_precios.columns[df_precios.columns.get_loc(columna)-1]] + [columna]].dropna()
   
    #Calculo la mgeom por variedad y tipo de informante
    df = df.groupby(["VARIEDAD", "TIPO"]).prod() ** (1/df.groupby(["VARIEDAD", "TIPO"]).count())
    
    #No me sale con el apply
    # from scipy.stats.mstats import gmean
    # mgeom = df_precios.groupby(["VARIEDAD", "TIPO"]).agg({'2020-11': lambda x: gmean(x), '2020-12': lambda x: gmean(x)})
    # df_precios['2020-11']df_precios.apply(gmean)
    
    #elimino la columna de informante y variedad 12
    df.drop(['INFORMANTE', 'VARIEDAD_12'], axis=1, inplace=True)
    
    meses = df.columns
    
    #Paso las filas TIPO a columnas
    df = df.pivot_table(df.columns,index='VARIEDAD',columns='TIPO')
    
    #Separo el dataframe segun tengan nulos o no
    df_unINF = df[df.isna().any(axis=1)].copy()
    df_dosINF = df.dropna().copy()
    
    ## Primero trabajo con los de un solo tipo de informante
    #Cambio el multindex por un índice único
    df_unINF.columns = df_unINF.columns.get_level_values(0)+ '_' +df_unINF.columns.get_level_values(1)
    
    #uno los tipos por su periodo
    df_unINF_0 = df_unINF[df_unINF.columns[0]].combine_first(df_unINF[df_unINF.columns[1]])
    df_unINF_1 = df_unINF[df_unINF.columns[2]].combine_first(df_unINF[df_unINF.columns[3]])
    
    #uno los periodos
    df_unINF = pd.merge(df_unINF_0, df_unINF_1, left_index=True, right_index=True)
    
    # Pongo los nombres segun los meses
    df_unINF.columns = meses
    
    ## Ahora trabajo con aquellos que tienen dos informantes
    df_dosINF.iloc[:, df_dosINF.columns.get_level_values(1)=='SUPER'] = df_dosINF.iloc[:, df_dosINF.columns.get_level_values(1)=='SUPER'] ** 0.25
    df_dosINF.iloc[:, df_dosINF.columns.get_level_values(1)=='TRAD'] = df_dosINF.iloc[:, df_dosINF.columns.get_level_values(1)=='TRAD'] ** 0.75
    
    df_dosINF.columns = df_dosINF.columns.get_level_values(0)+ '_' +df_dosINF.columns.get_level_values(1)
    df_dosINF[meses[0]] = df_dosINF[df_dosINF.columns[0]] * df_dosINF[df_dosINF.columns[1]]
    df_dosINF[meses[1]] = df_dosINF[df_dosINF.columns[2]] * df_dosINF[df_dosINF.columns[3]]
    df_dosINF.drop(df_dosINF.columns[:4], axis=1, inplace=True)

    df = pd.concat([df_unINF, df_dosINF]).sort_index().reset_index()
    
    df[columna] = df[df.columns[2]] / df[df.columns[1]]
    
    df.drop(df.columns[1], axis=1, inplace=True)
    
    return df
#%%

# df = calcular_variacion_mensual('SEPTIEMBRE_2020.xlsx', dir_bases='Series_precios', dir_var='Series_variaciones', guardar=True)
