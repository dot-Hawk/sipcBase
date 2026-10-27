# -*- coding: utf-8 -*-
"""
Created on Tue Jun 29 19:25:14 2021

A partir de una base limpia de precios (Ver archivo limpiar_bases.py) el programa genera una tabla ordenada
por variedad e informante de los precios de las variedades desde el mes base hasta el mes actual. 
Para que el programa identifique los archivos, los archivos deben estar nombrados de la siguiente forma: 
MES_AAAA.xlsx

@author: jimmy9v
"""

import pandas as pd
import os
from datetime import datetime as dt
import locale
locale.setlocale(locale.LC_ALL, 'esp_esp')

# path = './'
# dir_bases = path + 'precios/'

# df = pd.read_excel('Historico_precios.xlsx')
# df_relevados = pd.read_excel('Historico_precios_relevados.xlsx')

# meses_registrados = df.columns[3:]
# print(__name__)
#%%
def generar_mes_base(nombre_archivo, dir_bases='Bases_limpias_precios', guardar=False, base=True):
    '''
    

    Parameters
    ----------
    nombre_mes : TYPE
        DESCRIPTION.
    dir_bases : TYPE, optional
        DESCRIPTION. The default is 'Bases_limpias_precios'.
    guardar : TYPE, optional
        DESCRIPTION. The default is False.
    base : TYPE, optional
        DESCRIPTION. The default is True.

    Returns
    -------
    df : TYPE
        DESCRIPTION.

    '''
    # nombre_archivo = 'SEPTIEMBRE_2020.xlsx'
    # nombre_archivo = 'AGOSTO_2021.xlsx'
    path = './'
    
    df = pd.read_excel(os.path.join(path, dir_bases, nombre_archivo))
    
    df = df.dropna()
        
    df = df.reindex(columns=['VARIEDAD', 'INFORMANTE', 'TIPO', 'PRECIO NORMALIZADO'])
    
    import locale
    locale.setlocale(locale.LC_ALL, 'esp_esp')
    str_date = nombre_archivo.split('_')
    date = dt.strptime(str_date[0]+'-'+str_date[1][:4], '%B-%Y').date()
    
    df.rename(columns={"PRECIO NORMALIZADO": str(date)[:7]}, inplace = True)
    # df.set_index(['VARIEDAD','INFORMANTE'],inplace = True)
    
    if base:
        print(f'La base del periodo {str_date[0]}-{str_date[1][:4]} tiene:\n{len(df["VARIEDAD"].unique())} variedades y {len(df)} precios')
        df = continuar_serie(df, dir_bases)
    
    if guardar:
        # archivo_salida = os.path.join(path, 'Series_precios', nombre_mes)
        # df.to_excel(archivo_salida, sheet_name="Precios", index=False, merge_cells=False)
        
        #Incorporo al dataframe los codigos de 12 divisiones
        dicc_variedades = pd.read_excel('./recursos/DICCIONARIO_VARIEDADES.xlsx', usecols='A,B', index_col=0)
        df.insert(1, 'VARIEDAD_12', df.apply(lambda x: dicc_variedades.loc[x['VARIEDAD']], axis=1)['VARIEDAD_12'].tolist())
        
        try:
            df_imput = pd.read_excel(os.path.join(path, 'Series_precios', nombre_archivo), sheet_name="Precios imputados")
        except:
            df_imput = df[df.columns[:5]]

        # df.to_csv(os.path.join(path, 'Series_precios_csv', nombre_mes[:-5] + '.csv'), index=False)
        
        dir_salida= 'Series_precios'
        
        #Esta parte crea el directorio de destino si no existe
        from pathlib import Path
        mk_path=Path(dir_salida)
        mk_path.mkdir(parents=True, exist_ok=True)
        
        with pd.ExcelWriter(os.path.join(path, dir_salida, nombre_archivo)) as writer:
            df.to_excel(writer, sheet_name="Precios", index=False, merge_cells=False)
            df_imput.to_excel(writer, sheet_name="Precios imputados", index=False, merge_cells=False)
            writer.save()
            
      
    return df 
   
#%%

def continuar_serie(df_base, dir_bases):
    df = df_base
    variedades_base = df['VARIEDAD'].unique()
    
    date = dt.strptime(df.columns[3], '%Y-%m').date()
    archivos_precios = [str(date)[:7]]
    
    for root, dirs, files in os.walk(dir_bases):
        for name in files:
            if name[-5:] == '.xlsx': #Solo mirar archivos xlsx
            # name = 'OCTUBRE_2020.XLSX' # name = 'NOVIEMBRE_2020.XLSX'
                print(f'Estoy procesando el archivo {name}')
                try:
                    str_date_i = name.split('_')
                    date_i = dt.strptime(str_date_i[0]+'-'+str_date_i[1][:4], '%B-%Y').date()
                except:
                    print(f'{name}: Nombre incorrecto. Nombre correcto: MES_AA.xlsx ')
                    continue
                if date_i > date:
                    # print(date, name)
                    df_i = generar_mes_base(name, base=False)
                    #Contar la cantidad de variedades de cada base
                    # df_j = df_i.dropna()
                    # print(len(df_j['VARIEDAD'].unique()))
                    df = pd.merge(df, df_i, how = 'outer')
                    if str(date_i)[:7] not in archivos_precios:
                        archivos_precios.append(str(date_i)[:7])
        
        break 
    print('\n')
    
    #Se ordena la lista de archivos.        
    archivos_precios.sort()
     
    #Ordena la lista cronológicamente si no está ordenada
    if not (df.columns[3:] == archivos_precios).all():
    #Lista de meses cargados en el dataframe
        # meses_registrados = df.columns[3:]        
        df = df.reindex(columns=['VARIEDAD','INFORMANTE', 'TIPO']+archivos_precios)        
   
    #Se eliminan los datos de variedades que no estan en la base y ordeno por Var-Inf
    df = df[df['VARIEDAD'].isin(variedades_base)]
    df.sort_values(['VARIEDAD','INFORMANTE'], inplace=True)
    return df
#%% Generar un mes
# df = generar_mes_base('OCTUBRE_2020.xlsx', guardar=False)


#%% Generar series para todos los meses

# for root, dirs, files in os.walk('Bases_limpias_precios'):
#     for name in files:
#         if name[-5:] == '.xlsx': #Solo mirar archivos xlsx
#         # name = 'OCTUBRE_2020.XLSX' # name = 'NOVIEMBRE_2020.XLSX'
#             print(name)
#             try:
#                 str_date_i = name.split('_')
#                 date_i = dt.strptime(str_date_i[0]+'-'+str_date_i[1][:-5], '%B-%Y').date()
#             except:
#                 print(f'{name}: Nombre incorrecto. Nombre correcto: MES_AA.xlsx ')
#                 continue
#             generar_mes_base(name, guardar=True)
            
#     break

            

