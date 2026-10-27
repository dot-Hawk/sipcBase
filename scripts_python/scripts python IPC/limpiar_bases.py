# -*- coding: utf-8 -*-
"""
Created on Wed Jul 28 11:14:28 2021

@author: Jimmy

Este programa toma todos los arcivos xlsx de precios del INDEC en crudo almacenados por defecto en el directorio 
'./Bases_precios/' y con los nombres de la forma MMMM_AAAA, y a partir de ellos genera una base de datos 
con los promedios de los precios normalizados y el tipo de comercio (TIPO) para cada Variedad-Informante.
 
Opcionalmente se puede guardar la base de datos generada, por defecto, en el subdirectorio 
'./Bases_limpias_precios/', establececiendo la fecha de creación y modificación del archivo 
el día 1 del MES y AÑO coorespondiente al nombre del archivo.
"""

import pandas as pd
import os
import numpy as np

SUPER = [1550001, 1550002, 1550003, 1550004, 1550005, 1550006, 1550007, 1550008, 1550009,\
         1550010, 1571450, 1571468, 1571495, 1571517, 1571599, 1571625, 1571658, 1571661,\
         1571664, 1571665, 1571666, 1571677, 1571678, 1571429]

#%%

def crear_base_limpia(nombre_archivo, ruta_origen='Bases_precios', ruta_destino='Bases_limpias_precios', guardar=False, CC=True, decidir_CC=False): 
    '''
    Transforma un archivo XSLX con los precios exportados por el sistema de INDEC (IPN) a un dataframe con la 
    información mínima necesaria para crear la serie de precios. 
    Esta información es: Variedad, Informante, Precio promedio normalizado de las visitas, tipo de informante

    Parameters
    ----------
    nombre_archivo : STR
        Nombre del archivo tipo XSLX ubicado en la 'ruta_origen'. Se debe colocar la extensión del archivo.
        
    ruta_origen : STR, optional
        Subdirectorio en el cual se encuentran los archivos originales. The default is 'Bases_precios'.
        
    ruta_destino : STR, optional
        Subdirectorio en el cual se guarda la el archivo transformado. The default is 'Bases_limpias_precios'.
        
    guardar : BOOL, optional
        DESCRIPTION. The default is False. Si TRUE, el archivo se guarda en la 'ruta destino' en formato
        XLSX.
        
    CC : BOOL, optional
        DESCRIPTION. The default is True. 
        
    decidir_CC : BOOL, optional
        DESCRIPTION. The default is False. Si TRUE, se debe decidir desde la consola con las téclas S(i) y N(o)
        si el precio marcado como reemplazado se almacena en el dataframe de cambio de calidad o se omite.

    Returns
    -------
    df : DataFrame
        Devuelve un DataFrame con los precios y el tipo de comercio para cada variedad e informante. 
        Estos últimos son los índices del DataFrame. El nombre del archivo de salida es de la forma 
        MMMM_AAAA.xslx, es decir, nombre del mes en mayúsclas y el año separados por un guión bajo.

    '''
    
    # nombre_archivo = 'DICIEMBRE_2020.xlsx'
    # nombre_archivo = 'OCTUBRE_2021.xlsx'
    # nombre_archivo = name
    path = './'
    archivo = os.path.join(path, ruta_origen, nombre_archivo)
    
    # print(nombre_archivo)
    
    #Lista de informantes que son supuermercados. Podría guardarse en un archivo xlsx, txt o csv 
    #para facilitar su edición

    
    
    df = pd.read_excel(archivo)
    
    cols= [df.columns[10], df.columns[14], df.columns[15]]#, df.columns[22], df.columns[25]
    df[cols]=df[cols].replace(',','.',regex=True).astype(float)
    
    df.rename(columns={"Inf.": "INFORMANTE", "Variedad": "VARIEDAD"}, inplace = True)
    # En esta parte se podría incorporar cualquier manipulación respecto al tipo de precio. 
    # Como puede ser la desafectación de los N, el tratamiento especial de los E, etc.
    
    
    if CC:
        excel_cc = cambio_calidad(df)
        
        if decidir_CC:
            excel_cc = cambio_calidad(df, decidir=True)
    
    #Calculo los promedios de las visitas. En este paso se pierde toda la información no numérica
    df = df.groupby(["VARIEDAD", "INFORMANTE"]).mean()
    
    # Habilitando este paso se eliminan las combinaciones VARIEDAD-INFORMANTE sin precio. 
    # El paso no es necesario porque dicha información se filtra cuando corresponde en el futuro
    # df.loc[df[df.columns[6]].isnull(), df.columns[10]] = float("nan")
    
    df.rename(columns={ df.columns[10]: 'PRECIO NORMALIZADO' }, inplace = True) 
    df['PRECIO NORMALIZADO'] = df['PRECIO NORMALIZADO'].apply(lambda x: round(x, 2)) #redondeo a 2 dígitos
    
    '''En esta parte se puede agregar un paso (opcional) que impute la visita anterior y de esta forma 
    ampliar la base. No es lo ideal, pero se puede analizar.
    '''
    
    año = int(df.iloc[0,0])
    mes = int(df.iloc[0,1])
    
    df = df[['PRECIO NORMALIZADO']] #Elimino toda la información numérica que no voy a utilizar
    # df.reset_index(level=0, inplace=True)
    df['TIPO'] = np.where(df.index.get_level_values(1).isin(SUPER), 'SUPER', 'TRAD')
    # df['Precio Normalizado'].dropna()
    
    if guardar:

        from datetime import datetime as dt
        import locale
        locale.setlocale(locale.LC_ALL, 'esp_esp')
        # str_date = nombre_archivo.split('_')
        # date = dt.strptime(str_date[0]+'-'+str_date[1][:4], '%B-%Y').date()
        
        date = dt.strptime(str(mes) + '-' + str(año), '%m-%Y') #Fecha de los precios
        #Antiguamente esta información se tomaba del nombre del archivo, ahora ya no es requisito
        #Sin embargo lo será para que sea tenido en cuenta en el recorrido de la funcion limpiar_bases
        # date = dt.strptime(nombre_archivo[:-10]+'-'+nombre_archivo[-9:-5], '%B-%Y')

        nombre_salida = date.strftime("%B").upper() + '_' + date.strftime("%Y") + '.xlsx'
        
        archivo_salida = os.path.join(path, ruta_destino, nombre_salida)
        
        with pd.ExcelWriter(archivo_salida) as writer:
            df.to_excel(writer, sheet_name="Precios", index=True, merge_cells=False)
            excel_cc.to_excel(writer, sheet_name="Camb.Calidad", index=True, merge_cells=False)
            writer.save()
        
        '''Aca modifica la fecha de creacion del archivo al MES-AÑO de referencia.
        Esto permite que al ordenar por fecha o por nombre se logren agrupamientos mensuales
        o anuales
        '''
        os.utime(archivo_salida, (date.timestamp(),date.timestamp()))
        from win32_setctime import setctime
        setctime(archivo_salida, date.timestamp())
        
    return df
#%%

def limpiar_bases(ruta_origen, ruta_destino='Bases_limpias_precios', guardar=True, sobreescribir=False, CC=True, decidir_CC=False):
    '''
    Esta función toma un directorio de origen, mira todos los archivos excel con el nombre de la forma 
    MMMM_AAAA.xlsx, los convierte con la función crear_base_limpia() y los guarda en la ruta de destino, 
    por defecto en la ruta 'Bases_limpias_precios'. Tando el guardado como la sobreescritura de los archivos 
    es opcional.

    Parameters
    ----------
    ruta_origen : STR
        Directorio en el que se guardan las bases de precios.
    ruta_destino : STR
        Directorio en el que se van a guardar las bases limpias.
    guardar : BOOL, optional
        TRUE si se desean guardar los excel y False si solo se desea conocer el mes y la cantidad de precios. 
        The default is True.
    sobreescribir : BOOL, optional
        Reemplaza cualquier archivo de excel con el nombre de la forma MMMM_AAAA correspondiente 
        al periodo de referencia. The default is False.

    Returns
    -------
    None.

    '''
    # ruta_origen= 'Bases_limpias'
    from datetime import datetime as dt
    import locale
    locale.setlocale(locale.LC_ALL, 'esp_esp')
    path = './'
    dir_origen = os.path.join(path, ruta_origen)
    dir_destino = os.path.join(path, ruta_destino)
   
    #Esta parte crea el directorio de destino si no existe
    from pathlib import Path
    path=Path(dir_destino)
    path.mkdir(parents=True, exist_ok=True)
    
    if not guardar:
        #Si no voy a guadar la opción sobreescribir debe desactivarse
        sobreescribir = False
    
    if sobreescribir:
        #Si sobreescribo no necesito saber que hay en el directorio. Lo que coincida en nombre, se reemplaza
        for root, dirs, files in os.walk(dir_origen):
            for name in files:
                if name[-5:] == '.xlsx': #Solo mirar archivos xlsx
                # name = 'SEPTIEMBRE_2020.xlsx'
                    try:
                        str_date_i = name.split('_')
                        dt.strptime(str_date_i[0]+'-'+str_date_i[1][:4], '%B-%Y').date()
                    except:
                        print(f'{name}: Nombre incorrecto. Nombre correcto: MES_AA.xlsx ')
                        continue
                    base = crear_base_limpia(name, ruta_origen= ruta_origen, ruta_destino= ruta_destino, guardar=True, CC= CC, decidir_CC= decidir_CC)
                    print(f' El archivo {name} tiene {len(base["PRECIO NORMALIZADO"].dropna())} precios')
            break
    
    else:
    #Si no voy a sobreescribir, debo mirar que archivos estan para evitar procesarlos
        bases_limpias = []
        for root, dirs, files in os.walk(dir_destino):
            for name in files:
                bases_limpias.append(name)
            break
                
        for root, dirs, files in os.walk(dir_origen):
            for name in files:
                # print(name)
                if name[-5:] == '.xlsx': #Solo mirar archivos xlsx
                    # print(f'Estoy procesando {name}')
                    try:
                    #Para identificar a los archivos de excel que deben ser procesados,
                    #decidí que tengan la misma forma que la salida para evitar errores
                        str_date_i = name.split('_')
                        dt.strptime(str_date_i[0]+'-'+str_date_i[1][:4], '%B-%Y').date()
                    except:
                        print(f'{name}: Nombre incorrecto. Nombre correcto: MES_AA.xlsx ')
                        continue
                    # Finalmente miro si debo guardarlo o no
                    if guardar:
                        if name not in bases_limpias:
                            base = crear_base_limpia(name, ruta_origen= ruta_origen, ruta_destino= ruta_destino, guardar=True, CC= CC, decidir_CC= decidir_CC)
                            print(f' El archivo {name} tiene {len(base["PRECIO NORMALIZADO"].dropna())} precios')
                    else:
                        if name not in bases_limpias:
                            base = crear_base_limpia(name, ruta_origen= ruta_origen, guardar=False, CC= CC, decidir_CC= decidir_CC)
                            print(f' El archivo {name} tiene {len(base["PRECIO NORMALIZADO"].dropna())} precios')
            break
                

#%%
def cambio_calidad(df, decidir=False):
    import re
    df_cambio_calidad = df.copy()
    
    df_cambio_calidad = df[(df[df.columns[9]] =='C') & (df[df.columns[8]] !='A')]
    df_cambio_calidad = df_cambio_calidad[df_cambio_calidad.Atributos.str.contains('/', na=False)]
    
    df_cambio_calidad['TIPO'] = np.where(df_cambio_calidad['INFORMANTE'].isin(SUPER), 'SUPER', 'TRAD')
    
    if decidir:
        df_cambio_calidad['CAMBIO'] = np.nan
        
        for i in df_cambio_calidad[df_cambio_calidad['CAMBIO'].isnull()].index:
            # i= 186
            # i= 891
            # i= 2240
            # i= 10011
            # i= 11722
            variedad = df_cambio_calidad.loc[i, df_cambio_calidad.columns[20]]
            atributo = df_cambio_calidad.loc[i, 'Atributos']
            
            # DataFrame de los cambios de atributos
            df_atributos = pd.DataFrame(re.split(' [0-9]*- ', atributo))
            df_atributos.iloc[0,0] = df_atributos.iloc[0,0][5:]
            df_atributos = df_atributos[0].str.split(': ', n=1, expand=True)
            valores = df_atributos[1].str.split(' / ', expand=True)
            df_atributos['V. Actual'] = valores[0]
            df_atributos['V. Pasado'] = valores[1]
            df_atributos.drop(1, axis=1, inplace=True)
            df_atributos.columns = ['Caracteristica', 'V. Actual', 'V. Pasado']
            
            # Diccionario de variedades. Tiene el problema de que no puede distinguir facilmente 
            try:
                dict_atrib = {number.split(': ')[0]: number.split(': ')[1] for number in re.split(' ...- ', atributo)}
                dict_atrib[atributo.split(':')[0][5:]] = dict_atrib[list(dict_atrib.keys())[0]]
                del dict_atrib[list(dict_atrib.keys())[0]]
                dict_atrib['Variacion de precio'] = df_cambio_calidad.loc[i, df_cambio_calidad.columns[15]]
            except IndexError:
                print('No se pueden extraer los atributos del producto')
                dict_atrib = {'Atributo': atributo}
            
            
            # Filtro de producto sin cambios
            df_atributos.loc[df_atributos['V. Pasado'] == '--- ', 'V. Pasado'] = np.nan
            df_atributos.loc[df_atributos['V. Pasado'] == '---', 'V. Pasado'] = np.nan
            
                    
            if len(df_atributos.dropna(subset=['V. Pasado'])) == 0:
                df_cambio_calidad.loc[i, 'CAMBIO'] = 0
                print(f'Se autoexcluyó la variedad: {variedad}')
                for j in dict_atrib.keys():
                    print(f'{j}: {dict_atrib[j]}')
                print('\n')
            
            else:            
                print(f'{(df_cambio_calidad.index.get_loc(i)+1)}/{len(df_cambio_calidad)}')
                print(f'Variedad: {variedad}')
                for j in dict_atrib.keys():
                    print(f'{j}: {dict_atrib[j]}')
                if not pd.isna(df_cambio_calidad.loc[i,df_cambio_calidad.columns[-3]]):
                    print(f'{df_cambio_calidad.loc[i,df_cambio_calidad.columns[-3]]}')
                respuesta = input(f'Desea añadir la variedad {variedad} a la lista de cambio de calidad?[Si/No]')
                print('\n')
                respuesta_valida = respuesta.upper() in ['SI', 'S', 'NO', 'N']
                
                while not respuesta_valida:
                    print('Respuesta incorrecta. Solo se admite responder SI/NO')
                    print(f'Variedad: {variedad}')
                    for j in dict_atrib.keys():
                        print(f'{j}: {dict_atrib[j]}')
                    if not pd.isna(df_cambio_calidad.loc[i,df_cambio_calidad.columns[-3]]):
                        print(f'{df_cambio_calidad.loc[i,df_cambio_calidad.columns[-3]]}')      
                    respuesta = input(f'Desea añadir la variedad {variedad} a la lista de cambio de calidad?[Si/No]')
                    print('\n')
                    respuesta_valida = respuesta.upper() in ['SI', 'S', 'NO', 'N']
                
                # Respuesta.upper() in respuestas admitidas(SI, S, N, NO )
                
                
                if respuesta.upper()=='SI' or respuesta.upper()=='S':
                    df_cambio_calidad.loc[i, 'CAMBIO'] = 1
                
                elif respuesta.upper()=='NO' or respuesta.upper()=='N':
                    df_cambio_calidad.loc[i, 'CAMBIO'] = 0
                    
                else:
                    raise ValueError('Algo ha fallado en los cambios de calidad')
                    
        # df_cambio_calidad.to_excel('./Cambio_calidad.xlsx', index=True, merge_cells=False)
        
        # df_cambio_calidad = pd.read_excel('./Cambio_calidad.xlsx', index_col='Indice')
    else:
        df_cambio_calidad['CAMBIO'] = 1
            
    excel_cc = df_cambio_calidad[df_cambio_calidad['CAMBIO'] == 1].groupby(['VARIEDAD','INFORMANTE']).size().reset_index()
    excel_cc.drop(0, axis=1, inplace=True)
    excel_cc['P.ant'] = np.nan
    excel_cc['P.act'] = np.nan
    excel_cc.set_index(['VARIEDAD','INFORMANTE'], inplace=True)
    
    df_cambio_calidad_visita_2 = df_cambio_calidad[(df_cambio_calidad['Vis.']== 2) & (df_cambio_calidad['CAMBIO']== 1)]
    df_cambio_calidad_visita_1 = df_cambio_calidad[df_cambio_calidad['CAMBIO']== 1].drop(df_cambio_calidad_visita_2.index)
    
    df_cambio_calidad_visita_2.reset_index(inplace=True)
    df_cambio_calidad_visita_2.set_index(['VARIEDAD','INFORMANTE'], inplace=True)
        
    df_cambio_calidad_visita_1.reset_index(inplace=True)
    df_cambio_calidad_visita_1.set_index(['VARIEDAD','INFORMANTE'], inplace=True)
    
    df_mean = df.groupby(["VARIEDAD", "INFORMANTE"]).mean()
    for i in df_cambio_calidad_visita_1.index:
        excel_cc.loc[i, 'P.act'] = df_mean.loc[i, df_mean.columns[10]]
        
    
    for i in df_cambio_calidad_visita_2.index:
        excel_cc.loc[i, 'P.act'] = df_cambio_calidad_visita_2.loc[i, df_cambio_calidad_visita_2.columns[13]]
        excel_cc.loc[i, 'P.ant'] = df_cambio_calidad_visita_2.loc[i, df_cambio_calidad_visita_2.columns[21]]
    
    excel_cc['P.act'] = pd.to_numeric(excel_cc['P.act'],errors='coerce')
    excel_cc['P.ant'] = pd.to_numeric(excel_cc['P.ant'],errors='coerce')
    
    excel_cc['P.act'] = excel_cc['P.act'].apply(lambda x: round(x, 2))
    excel_cc['P.ant'] = excel_cc['P.ant'].apply(lambda x: round(x, 2))
    
    '''
    Divide el atributo por el codigo
    '''
    
    return excel_cc

#%%
# nombre_archivo = 'SEPTIEMBRE_2020.xlsx'
# nombre_archivo = 'SEPTIEMBRE_2021.xlsx'
# ruta_destino = 'Bases_limpias_precios'
# crear_base_limpia(nombre_archivo='SEPTIEMBRE_2021.xlsx', ruta_origen='Bases_precios', ruta_destino= '', guardar=False, CC=True)


# %% Ejecución
# # ruta_origen = 'Bases_precios'
# ruta_destino = 'Bases_limpias_precios'
# limpiar_bases('Bases_precios', ruta_destino, guardar=True)

#%%
# def main(argv):
#     if len(sys.argv) == 3:
#         limpiar_bases('Bases_precios', 'Bases_limpias_precios')
#     else:
#         raise SystemExit(f'Uso adecuado: {sys.argv[0]}, dir_origen, dir_destino. Opcional: Guardar=True')
#     return None

# if __name__ == '__main__':
#     import sys
#     main(sys.argv)
