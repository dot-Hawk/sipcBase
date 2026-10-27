# -*- coding: utf-8 -*-
"""
Created on Wed Aug  4 09:42:26 2021

@author: Jimmy9v

A partir de un excel o csv con una serie de precios obtenido del programa definir_base.py, este programa 
imputa los precios faltantes de dicho archivo siguiendo los criterior de la metodología 22 del INDEC.
Actualmente imputa por la clasificación de 12 Divisiones, pero se debe revisar porque dicha clasificación 
comienza a nivel producto.
"""

"""
Una idea interesante es crear csv con promedios alternativos para los cambios de calidad 
o aumento de informantes. NO

Otra forma de realizar imputaciones es por tipo de informante. No parece haber criterio para determinar 
si es mejor o peor, pero quizas se pueda calcular si tiene menor variabilidad o que al menos las imputaciones 
esten dentro del intervalo de los precios finalmente observados para el producto.
"""
import pandas as pd
import os
from datetime import datetime as dt
import locale
locale.setlocale(locale.LC_ALL, 'esp_esp')

#%%

def imputar_base(nombre_mes_base, dir_series='Series_precios', dir_bases='Bases_limpias_precios' , guardar=True):
    from datetime import datetime as dt
    import dateutil.relativedelta
    '''
    Parameters
    ----------
    data_frame : pd.DataFrame
        Recibe el dataframe del archivo de excel con los precios de los distintos meses desde
        el mes base.
    dir_series : STR
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
    # nombre_mes_base = 'SEPTIEMBRE_2020.xlsx' 'JULIO_2021'
    path = './'
    
    # Creo los dataframe de la base con los precios observados y de los precios ya imputados
    df_base = pd.read_excel(os.path.join(path, dir_series, nombre_mes_base), sheet_name="Precios") #Observados
    df = pd.read_excel(os.path.join(path, dir_series, nombre_mes_base), sheet_name="Precios imputados") #Imputados
    
    try:
        df = df.drop(['VARIEDAD_12'], axis=1)
        df_base = df_base.drop(['VARIEDAD_12'], axis=1)
    except:
        pass
    
    #Calculo los meses que faltan imputar
    meses_sin_imputar = df_base.columns.drop(df.columns)
    
    #Creo el DataFrame de los meses que faltan imputar
    df_sin_imputar = pd.concat([pd.DataFrame(df_base, columns=[i]) for i in df.columns[:3].union(meses_sin_imputar, sort=False)], axis=1)
    
    #Uno el DataFrame de los Imputado con los que faltan imputar
    df = pd.merge(df, df_sin_imputar, how = 'outer')
    
    #Ahora debo resetear los índices para que sean iguales en df y df_base?
    if len(df) == len(df_base):
        df.sort_values(by=['VARIEDAD', 'INFORMANTE'], inplace=True)
        df_base.sort_values(by=['VARIEDAD', 'INFORMANTE'], inplace=True)
        df.reset_index(drop=True, inplace=True)
        df_base.reset_index(drop=True, inplace=True)
    else:
        raise RuntimeError('Los data frame tienen distintas longitudes. Revisar!')
    
    #Elimino el df de los meses sin imputar
    # del df_sin_imputar
    
    #Separo del DataFrame a las variedades con tratamiento especial. Luego del proceso agrego la lista
    tratamiento_especial = pd.read_excel('./recursos/TRATAMIENTO_ESPECIAL.xlsx', header=None, usecols='A')[0].tolist()
    
    df_especial = df[df.VARIEDAD.isin(tratamiento_especial)]
    df = df[~df.VARIEDAD.isin(tratamiento_especial)].copy()
    df_base = df_base[~df_base.VARIEDAD.isin(tratamiento_especial)].copy()
    
    #Incorporo al dataframe los codigos de 12 divisiones
    dicc_variedades = pd.read_excel('./recursos/DICCIONARIO_VARIEDADES.xlsx', usecols='A,B', index_col=0)
   
    df.insert(1, 'VARIEDAD_12', df.apply(lambda x: dicc_variedades.loc[x['VARIEDAD']], axis=1)['VARIEDAD_12'].tolist())
    df_base.insert(1, 'VARIEDAD_12', df_base.apply(lambda x: dicc_variedades.loc[x['VARIEDAD']], axis=1)['VARIEDAD_12'].tolist())
    df_especial.insert(1, 'VARIEDAD_12', df_especial.apply(lambda x: dicc_variedades.loc[x['VARIEDAD']], axis=1)['VARIEDAD_12'].tolist())
    
    
    #imputaciones de precios mes a mes
    #Para cada mes que no se ha imputado
    '''A partir de aca hay que mirar para que el sistema impute bien. Ahora esta tomando el DF de imputados. 
    Esto es un error porque de hacerse asi, una vez imputado un mes, al mes siguiente el filtro que descarta
    la ausencia de precios en el mes anterior no va a funcionar correctamente
    '''
    mes_base = df_base.columns[4]
    date_i_base = dt.strptime(mes_base, '%Y-%m').date()
    
    for mes in meses_sin_imputar:
        #Selecciono las columnas de informacion, el mes a imputar y el mes anterior
        # mes = meses_sin_imputar[0]
        
        #Creo la base para hacer las imputaciones
        df_base_imputacion = df_base[['VARIEDAD', 'VARIEDAD_12', 'INFORMANTE', 'TIPO', df_base.columns[df_base.columns.get_loc(mes)-1],mes]].copy()
        
        
        #Creo los datetime de los meses a trabajar
        date_i = dt.strptime(mes, '%Y-%m').date()
        date_i_ant = date_i - dateutil.relativedelta.relativedelta(months=1)
        
        #Transformo la fecha en un nombre de archivo
        str_mes = date_i.strftime("%B_%Y").upper() + '.xlsx'
        str_mes_ant = date_i_ant.strftime("%B_%Y").upper() + '.xlsx'
        
        #Creo el path para abrir los archivos con los cambios de calidad
        archivo_mes = os.path.join(path, dir_bases, str_mes)
        archivo_mes_ant = os.path.join(path, dir_bases, str_mes_ant)
        
        
        #Abro la lista de cambio de calidad del mes
        df_cc = pd.read_excel(archivo_mes, sheet_name="Camb.Calidad")
        
        #inserto el indice de base_imputacion en el dataframe de cambio de calidad
        df_cc = df_cc.merge(df_base_imputacion.reset_index()[['VARIEDAD', 'INFORMANTE', 'index']], on=['VARIEDAD', 'INFORMANTE'] , how='left').set_index('index')
        
        #Reemplazo 
        df_base_imputacion.loc[df_cc.index.dropna(), df_base_imputacion.columns[-1]]= df_cc.loc[df_cc.index.dropna(), 'P.ant']
        df.loc[df_cc.index.dropna(), mes]= df_cc.loc[df_cc.index.dropna(), 'P.ant']
        
        #Compruebo no estar en el mes base
        if date_i_ant != date_i_base:
            #Abro la lista de cambio de calidad del mes anterior
            df_cc_ant = pd.read_excel(archivo_mes_ant, sheet_name="Camb.Calidad")
            
            #inserto el indice de base_imputacion en el dataframe de cambio de calidad   
            df_cc_ant = df_cc_ant.merge(df_base_imputacion.reset_index()[['VARIEDAD', 'INFORMANTE', 'index']], on=['VARIEDAD', 'INFORMANTE'] , how='left').set_index('index')
            
            #Reemplazo 
            df_base_imputacion.loc[df_cc_ant.index.dropna(), df_base_imputacion.columns[-2]]= df_cc_ant.loc[df_cc_ant.index.dropna(), 'P.act']
            df.loc[df_cc_ant.index.dropna(), mes]= df_cc_ant.loc[df_cc_ant.index.dropna(), 'P.act']
        
        #  else:
        #     print('El mes base no tiene cambio de calidad')
        
        #Elimino las filas sin precios para el mes anterior al de la imputacion
        df_base_imputacion = df_base_imputacion[df_base_imputacion[df_base.columns[df_base.columns.get_loc(mes)-1]].notna()]
        
        
        #creamos la columna de variacion relativa
        df_base_imputacion["variacion"] = df_base_imputacion.apply(lambda x: x[df_base_imputacion.columns[-1]]/x[df_base_imputacion.columns[-2]], axis=1)
        
        df = calcular_variacion(df, df_base_imputacion, n=0, debug=False, deep_debug=False)
        
    ''' Falta añadir los precios especiales.
        Ver si el bucle for para imputaciones se debe hacer en una funcion aparte o no (no parece hacer falta)
    '''
    
    
    df_especial = df_especial.drop(df_especial.columns[4:].tolist(), axis=1)
    df_especial.drop_duplicates(subset=['VARIEDAD'], inplace=True)
        
    df = pd.concat([df, df_especial])
    df_base = pd.concat([df_base, df_especial])
        
    if guardar:
        # archivo_salida = os.path.join(path, 'Series_precios', nombre_mes)
        # df.to_excel(archivo_salida, sheet_name="Precios", index=False, merge_cells=False)
        # try:
        #     df_imput = pd.read_excel(os.path.join(path, 'Series_precios', nombre_mes_base), sheet_name="Precios imputados")
        # except ValueError:
        #     df_imput = df[df.columns[:4]]
            
        # df.to_csv(os.path.join(path, 'Series_precios_csv', nombre_mes[:-5] + '.csv'), index=False)

        with pd.ExcelWriter(os.path.join(path, dir_series, nombre_mes_base)) as writer:
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
def calcular_variacion(df, df_base_imputacion, n=0, debug=True, deep_debug=False):
    '''
    Esta funcion recibe un data frame con los precios de un mes sin imputar y los de su predecesor (excluyendo
    las celdas sin datos) y devuelve la misma tabla con los precios imputados para el mes correspondiente
    
    Parameters
    ----------
    df_imputacion : TYPE
        DESCRIPTION.
    n : TYPE, optional
        DESCRIPTION. The default is 0.
    debug : TYPE, optional
        DESCRIPTION. The default is True.
    deep_debug : TYPE, optional
        DESCRIPTION. The default is False.

    Returns
    -------
    df : TYPE
        DESCRIPTION.

    '''
    from scipy.stats.mstats import gmean
    import copy
    
    mes_base_imputacion = df_base_imputacion.columns[-3]
    mes_imputando = df_base_imputacion.columns[-2]
    
    df_imputacion = copy.deepcopy(df_base_imputacion)
    
    df_control = df[['VARIEDAD', 'VARIEDAD_12', 'INFORMANTE', 'TIPO', mes_base_imputacion, mes_imputando]]
    #Elimino las filas sin precios para el mes anterior al de la imputacion
    df_control = df_control[df_control[mes_base_imputacion].notna()]
    
    #No quiero perder tiempo en un mes que esta completo
    if not df_control[df_control.columns[-1]].isnull().any():
        return df #Es mejor poner un break o pass? Revisar la teoria!!!
    
    # creamos la listas de variedades y productos
    variedades = df['VARIEDAD'].unique()
    productos = df['VARIEDAD_12'].unique()
    
    niveles = ['Variedades', '', 'Productos', 'Subgrupos', 'Grupos', 'Capítulos', 'Divisiones', 'General']
    #Subclase, Clase, Grupo
               
    if n == 1 or n == 6:
        n += 1
    elif n==9:
        raise('Error en el programa. No hay un nivel superior al General')

    if debug:
        print(f'Voy a estimar los promedios geométricos de las variaciones de lxs {niveles[n]} \n')
    
    
    if n==0:
        for variedad in variedades:
            # variedad = 1111507 1111201
            # variedad = 1151304 1131201
            # variedad = 2122102 #Tiene precios para variedad A en Sep
            
            base_imputacion = df_imputacion[df_imputacion['VARIEDAD'] == variedad].copy()
            base_producto = df[df['VARIEDAD'] == variedad].copy()
            # base_producto.dropna(subset=[df.columns[-4]], inplace = True)
    
            if deep_debug:
                print('Estoy trabajando con')
                print(f'{base_producto}')
                
    
            if base_imputacion['variacion'].isnull().sum() < len(base_imputacion['VARIEDAD']):
                #En la vesion original la condicion es tener mas de la mitad de los precios
                variacion_prom = gmean(base_imputacion['variacion'].dropna())
               
                if deep_debug:
                    print(f'Faltan {base_producto.isnull().sum().sum()} precios en una base de \
                            {len(base_producto["VARIEDAD"])} datos')
                    print(f'La media geometrica de la variacion del producto {variedad//(10**n)} es {variacion_prom}')
                
                                
                # # Reemplazo sin bucle
                lista_index_variedad_a_imputar = base_producto[base_producto[mes_imputando].isna()].dropna(subset=[mes_base_imputacion]).index
                df.loc[lista_index_variedad_a_imputar, mes_imputando] = variacion_prom * df.loc[lista_index_variedad_a_imputar, mes_base_imputacion]
                
                # # Reemplazo con bucle
                # for i in base_producto[mes_base_imputacion].dropna().index:
                #     if pd.isnull(base_producto[mes_imputando][i]):
                #         # if deep_debug:
                #         #     print(f'estoy en la fila {base_producto.index}')
                #         #     print(f'voy a insertar {variacion_prom} en {df.loc[i]}')
                #         #Inserto en la base de precios imputados la imputación del precio que es la producto de 
                #         #la variación promedio calculada y el precio del mes anterior
                #         df.loc[i, mes_imputando] = variacion_prom * df.loc[i, mes_base_imputacion] 
                #         # df_imputacion.loc[i,"variacion"] = variacion_prom
                #         # df_imputacion.loc[i,base_imputacion.columns[-2]] = variacion_prom * df_imputacion.loc[i,base_imputacion.columns[-3]]
        
                '''Si la cantidad de precios válidos es inferior a un 20% de la exigida para
                esa variedad, estos precios son descartados, aplicándoles a todos los precios
                del mes anterior la variación promedio observada en los precios de las demás
                variedades del agrupamiento inmediato superior.'''
            '''
            # elif n == 0 and (len(base_producto['VARIEDAD']) > 6) and (base_producto['variacion'].isnull().sum() > len(base_producto['VARIEDAD'])*4//5):
                
            #     if debug:
            #         print(f'Tengo menos del 20% de los precios de la variedad {variedad} los voy a eliminar')
            #         print(f'Tengo {base_producto["variacion"].isnull().sum()} precios faltantes')
            #         print(f'Puedo tener hasta {len(base_producto["VARIEDAD"])*4//5}')
                
            #     for i in base_producto.index:
            # #         if pd.isnull(base_producto['variacion_aux'][i]):
            # #             if deep_debug:
            # #                 print(f'estoy en la fila {base_producto.index}')
            # #                 print(f'voy a insertar {variacion_prom} en {df.loc[i]}')
            #         df.loc[i,"variacion_aux"] = float("nan")
            #         df.loc[i,df.columns[3]] = float("nan")
     
            # # else:
            # #     pass
            # #No registra cambios agregando este paso. Debe estar incluido    
            '''

    #Aca cambio a la clasificación nueva y empiezo a imputar por producto
    for variedad in productos:
    # variedad = 1111507   2122104
    # variedad = 'A0116106' 'A0111105' 'A0452104' 'A0112511' 'A0111107'
    # variedad = 'A0312208' #Tiene precios para variedad A en Sep
    # n = 2 
        if n==0:
            df_imputacion = copy.deepcopy(df_base_imputacion)
            base_producto = df[df['VARIEDAD_12'] == variedad].copy()
            base_imputacion = df_imputacion[df_imputacion['VARIEDAD_12'] == variedad].copy()
        else:    
            base_producto = df[df['VARIEDAD_12'].str.contains(variedad[:-n])].copy()
            base_imputacion = df_imputacion[df_imputacion['VARIEDAD_12'].str.contains(variedad[:-n])].copy()

        if deep_debug:
            print('Estoy trabajando con')
            print(f'{base_producto}')
            

        if base_imputacion['variacion'].isnull().sum() == 0:
            pass
        
        elif base_imputacion['variacion'].isnull().sum() < len(base_imputacion['VARIEDAD']) :
            #En la vesion original la condicion es tener mas de la mitad de los precios
            variacion_prom = gmean(base_imputacion['variacion'].dropna())
           
            if deep_debug:
                print(f'Faltan {base_producto.isnull().sum().sum()} precios en una base de \
                        {len(base_producto["VARIEDAD"])} datos')
                print(f'La media geometrica de la variacion del producto {variedad//(10**n)} es {variacion_prom}')
            
            
            # # Reemplazo sin bucle
            lista_index_variedad_a_imputar = base_producto[base_producto[mes_imputando].isna()].dropna(subset=[mes_base_imputacion]).index
            df.loc[lista_index_variedad_a_imputar, mes_imputando] = variacion_prom * df.loc[lista_index_variedad_a_imputar, mes_base_imputacion]
                
            # # Reemplazo con bucle for
            # for i in base_producto[mes_base_imputacion].dropna().index:
            #     if pd.isnull(base_producto[mes_imputando][i]):
            #         df.loc[i, mes_imputando] = variacion_prom * df.loc[i, mes_base_imputacion] 
            #         # df_imputacion.loc[i,"variacion"] = variacion_prom
            #         # df_imputacion.loc[i,base_imputacion.columns[-2]] = variacion_prom * df_imputacion.loc[i,base_imputacion.columns[-3]]
            #         # if deep_debug:
            #         #     print(f'estoy en la fila {base_producto.index}')
            #         #     print(f'voy a insertar {variacion_prom} en {df.loc[i]}')
    
            
    df_control = df[['VARIEDAD', 'VARIEDAD_12', 'INFORMANTE', 'TIPO', mes_base_imputacion, mes_imputando]]
    #Elimino las filas sin precios para el mes anterior al de la imputacion
    df_control = df_control[df_control[mes_base_imputacion].notna()]
    
    base_sin_precios = df_control[df_control[df_control.columns[-1]].isnull()]
    
    if debug:
        print('Listo!!!\n')
        print(f'Hay precios por imputar? {df_control.isnull().values.any()}')
        if df_control.isnull().values.any():
            print(f'Cuantos? {len(base_sin_precios)}\n{base_sin_precios}')
    
    
    if not base_sin_precios.empty:
        if debug or deep_debug:
            print('Estoy subiendo un nivel porque no hay suficientes precios.\n \n')
        n += 1
        
        if deep_debug:
            import timeit as tt
            tt.timeit('time.sleep(3)', number = 3)
            
        calcular_variacion(df, df_base_imputacion, n)   
    # else:
        # filas_sin_precio = df[df.iloc[:, -2].isnull()]
        # for fila in filas_sin_precio.index:
        # # print(f'Estoy en la fila {i} \n {fila_sin_precio.loc[i]}')
        # # print(f'Debería multiplicar {fila_sin_precio.loc[i,columna_base]} con {fila_sin_precio.loc[i,"variacion"]}')
        # # print(f'Este resultado lo debo colocar en la fila {i}\n{df.loc[i]}')
        # # print()
        #     df.loc[fila,df.columns[-2]] = filas_sin_precio.loc[fila,df.columns[-3]] * filas_sin_precio.loc[fila,df.columns[-1]]
    return df
#%%

# imputar_base(nombre_mes_base = 'SEPTIEMBRE_2020.xlsx')
# imputar_base(nombre_mes_base = 'AGOSTO_2021.xlsx')
# imputar_base(nombre_mes_base = 'JUNIO_2021.xlsx')


#%% Generar series para todos los meses

# for root, dirs, files in os.walk('Series_precios'):
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
#             imputar_base(name, guardar=True)
            
#     break

#%% Medir tiempo

# import time

# start_time = time.time()

# imputar_base(nombre_mes_base = 'OCTUBRE_2020.xlsx', guardar=False)

# end_time = time.time()
# print("Elapsed time was %g seconds" % (end_time - start_time))
