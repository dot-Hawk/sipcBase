# -*- coding: utf-8 -*-
"""
Created on Fri Oct 22 09:53:47 2021

@author: Usuario
"""

import pandas as pd
import os
from datetime import datetime as dt
import locale
locale.setlocale(locale.LC_ALL, 'esp_esp')

#%%

def incorporar_precios_nuevos (nombre_mes_base, dir_bases='Series_precios', guardar=True, esperar_meses=2):
    '''
    Parameters
    ----------
    data_frame : pd.DataFrame
        Recibe el dataframe del archivo de excel con los precios de los distintos meses desde
        sep-2020.
    dir_bases : STR
        Nombre del directorio donde se encuentran los archivos xlsx con los precios normalizados.
        Los archivos deben tenr el nombre de la siguiente forma: AAAA_MM.xlsx
    guardar : BOOL, optional
        Parámetro que determina si se guarda o no la base de datos de precios nueva.
        The default is True.

    Returns
    -------
    df : pd.DataFrame
        DataFrame con los precios de todos los meses de los que se tenga registro.
    '''
    
    # nombre_mes_base = 'AGOSTO_2021.xlsx' 'SEPTIEMBRE_2020.xlsx' 'JULIO_2021'
    path = './'
    
    #Separo del DataFrame a las variedades con tratamiento especial. Luego del proceso agrego la lista
    tratamiento_especial = pd.read_excel('./recursos/TRATAMIENTO_ESPECIAL.xlsx', header=None, usecols='A')[0].tolist()
    
    # Creo los dataframe de la base con los precios observados y de los precios ya imputados
    df_base = pd.read_excel(os.path.join(path, dir_bases, nombre_mes_base), sheet_name="Precios") #Observados
    df = pd.read_excel(os.path.join(path, dir_bases, nombre_mes_base), sheet_name="Precios imputados") #Imputados
    
    
    try:
        df_precios = pd.read_excel(os.path.join(path, dir_bases, nombre_mes_base), sheet_name="Precios utilizados") #Imputados
        df_precios = df_precios[~df_precios.VARIEDAD.isin(tratamiento_especial)].copy()
    
    except ValueError:
        df_precios = df[df.columns[:5]]
        df_precios = df_precios[~df_precios.VARIEDAD.isin(tratamiento_especial)].copy()
        df_precios = df_precios[df_precios[df_precios.columns[4]].notnull()]
    

    df_especial = df[df.VARIEDAD.isin(tratamiento_especial)]
    df = df[~df.VARIEDAD.isin(tratamiento_especial)].copy()
    df_base = df_base[~df_base.VARIEDAD.isin(tratamiento_especial)].copy()
    
       
   
   
    df_precios = incorporar_precios(df_precios, df_base, df, esperar_meses=2)
       
    
    df = pd.concat([df, df_especial])
    df_base = pd.concat([df_base, df_especial])
    df_precios = pd.concat([df_precios, df_especial])
    
    
    
    
    if guardar:
        
        with pd.ExcelWriter(os.path.join(path, dir_bases, nombre_mes_base)) as writer:
            df_precios.to_excel(writer, sheet_name="Precios utilizados", index=False, merge_cells=False)            
            df_base.to_excel(writer, sheet_name="Precios", index=False, merge_cells=False)
            df.to_excel(writer, sheet_name="Precios imputados", index=False, merge_cells=False)
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
    
    
    return df

#%%
def incorporar_precios(df_precios, df_base, df, esperar_meses= 2):
    print(f'Voy a incorporar los precios de informantes nuevos esperando {esperar_meses} meses')
    
    meses_a_incorporar = df.columns.drop(df_precios.columns)
    
    if len(meses_a_incorporar) == 0:
        return df_precios
    
    if len(meses_a_incorporar) <= esperar_meses:
        df_precios = pd.merge(df_precios, df[df.columns[:4].tolist()+df.columns[df.columns.get_loc(meses_a_incorporar[0]):].tolist()], how='left')
        return df_precios
    
    # Incorporar estas ideas 
    # df_actual = df_base[df_base['2020-09'].notnull()]
    # df_restantes = df_base.drop(df_actual.index)
    
    mes = 1
    while len(df_precios.columns[4:]) < esperar_meses+1:
        df_precios = pd.merge(df_precios, df[df.columns[:df.columns.get_loc(meses_a_incorporar[0])+1]], how='left')
        meses_a_incorporar = meses_a_incorporar.drop(meses_a_incorporar[0])
        mes += 1
    del mes
    
    while len(meses_a_incorporar) > 0 :
        df_a_incorporar = df_base[df_base.columns[:df_base.columns.get_loc(meses_a_incorporar[0])+1]]
                             
        for i in range(esperar_meses+1):
            # i=0
            df_a_incorporar = df_a_incorporar[df_a_incorporar[df_a_incorporar.columns[-1-i]].notnull()]
        df_a_incorporar.drop(df_a_incorporar.columns[4:df.columns.get_loc(df_a_incorporar.columns[-1])], axis=1, inplace=True)
        
        df_precios = pd.merge(df_precios, df_a_incorporar, how='outer')
 
        meses_a_incorporar = meses_a_incorporar.drop(meses_a_incorporar[0])
        
        df = df.set_index(['VARIEDAD', 'INFORMANTE'])
        df_base = df_base.set_index(['VARIEDAD', 'INFORMANTE'])
        df_precios = df_precios.set_index(['VARIEDAD', 'INFORMANTE'])
        
        nulos = df_precios[df_precios[df_precios.columns[-1]].isnull()].index
        
        for nulo in nulos:
            # nulo=(1111101, 1550007)
            df_precios.loc[nulo, df_precios.columns[-1]] = df.loc[nulo, df_precios.columns[-1]]
        
        df.reset_index(inplace=True)
        df_base.reset_index(inplace=True)
        df_precios.reset_index(inplace=True)
        
    df.sort_values(by=['VARIEDAD', 'INFORMANTE'], inplace=True)
    df_base.sort_values(by=['VARIEDAD', 'INFORMANTE'], inplace=True)
    df_precios.sort_values(by=['VARIEDAD', 'INFORMANTE'], inplace=True)
    # if len(df_precios.columns[4:]) < esperar_meses+1:
        
    return df_precios
    
    
#%%

# incorporar_precios_nuevos ('SEPTIEMBRE_2020.xlsx', dir_bases='Series_precios')
# incorporar_precios_nuevos ('AGOSTO_2021.xlsx', dir_bases='Series_precios')
# incorporar_precios_nuevos ('JULIO_2021.xlsx', dir_bases='Series_precios')
  
#%%  

# for root, dirs, files in os.walk('Series_precios'):
#     for name in files:
#         if name[-5:] == '.xlsx': #Solo mirar archivos xlsx
#         # name = 'SEPTIEMBRE_2020 - copia.xlsx' 'OCTUBRE_2020.XLSX' # name = 'NOVIEMBRE_2020.XLSX'
#             print(name)
#             try:
#                 str_date_i = name.split('_')
#                 date_i = dt.strptime(str_date_i[0]+'-'+str_date_i[1][:-5], '%B-%Y').date()
#                 # print(date_i)
#             except:
#                 print(f'{name}: Nombre incorrecto. Nombre correcto: MES_AA.xlsx ')
#                 continue
#             incorporar_precios_nuevos(name)
            
#     break   
    
    
    
    
    
    
    
    
    
    
    
    

