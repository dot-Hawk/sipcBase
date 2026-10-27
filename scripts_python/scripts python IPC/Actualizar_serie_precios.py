# -*- coding: utf-8 -*-
"""
Created on Tue Nov  9 12:37:40 2021

@author: Usuario

Ejecuta los archivos .py para actualizar o crear la serie de variaciones mensuales de precios para un mes base.
"""

from tkinter import *
from tkinter import filedialog, messagebox, simpledialog
from tkinter import Button
from tkinter import ttk
# from PIL import Image, ImageTk
# import time

import os
from os import remove
import pandas as pd
        
from datetime import datetime as dt
import locale
locale.setlocale(locale.LC_ALL, 'esp_esp')

import webbrowser
# import tkHyperlinkManager

import limpiar_bases
import definir_base
import imputar_faltantes
import incorporar_precios_nuevos
import calcular_variacion_mensual

import warnings
warnings.filterwarnings("ignore")


class Aplicacion():
    def __init__(self):
                
        self.root = Tk()# Toplevel() 
        self.root.title('Calculo IPC Provincial')
        self.root.geometry('750x750') #Tamaño
        self.root.resizable(0,0) #w,h #prohibe redimensionar la ventana
        self.root.iconbitmap('fsa.ico') #icono
        # # root.config(bg='blue') #color de fondo
        
        #Directorios
        self.path= './'
        self.dir_serie_precios= 'Series_precios'
        self.dir_serie_variaciones= 'Series_variaciones'
        self.dir_IPN= 'Bases_precios'
        self.dir_BLP= 'Bases_limpias_precios'
        
        #Atributos
        self.lista_archivos= []
        self.meses_archivos_IPN= []
        self.lista_columnas_esperada=[]
        self.nombre_archivo= ''
        self.fecha_archivo_base= ''
        
        self.nombre_archivo_var= StringVar()
        self.nombre_archivo_var.set('')
        
        
        #iconos
        
        self.refresh_ico = PhotoImage(file = r"./refresh.png")
        # self.refresh_ico = Image.open('./refresh.png').resize((20,20), Image.ANTIALIAS)
        # self.refresh_ico = ImageTk.PhotoImage(self.refresh_ico)
        
        self.folder_ico = PhotoImage(file = r"./folder.png")
        # self.folder_ico = Image.open('./folder.png').resize((20,20), Image.ANTIALIAS)
        # self.folder_ico = ImageTk.PhotoImage(self.folder_ico)
        
        ##Barra Menu
        #creacion de la barra
        self.barra_menu= Menu(self.root)
        self.root.config(menu= self.barra_menu)
        
        #creación de las cascadas
        self.menu_archivo= Menu(self.barra_menu, tearoff=0)
        # self.menu_edicion= Menu(self.barra_menu)
        # self.menu_preferencias= Menu(self.barra_menu)
        self.menu_ayuda= Menu(self.barra_menu, tearoff=0)
        
        #Posicionamiento de las cascadas
        self.barra_menu.add_cascade(label='Archivo', menu= self.menu_archivo)
        # self.barra_menu.add_cascade(label='Edicion', menu= self.menu_edicion)
        # self.barra_menu.add_cascade(label='Preferencias', menu= self.menu_preferencias)
        self.barra_menu.add_cascade(label='Ayuda', menu= self.menu_ayuda)
        
        #Menu archivo
        self.menu_archivo.add_command(label='Reiniciar', command=self.reiniciar)
        self.menu_archivo.add_command(label='Salir', command= lambda: self.root.destroy())
        
        #Menu ayuda
        self.menu_ayuda.add_command(label='Ayuda (mail)', command= lambda: webbrowser.open_new('mailto:jimmy.9v@gmail.com'))
        self.menu_ayuda.add_command(label='Acerca de...', command=self.info)
        
        
        #Creacion del primer frame
        self.frame_principal= Frame(self.root)
        self.frame_principal.pack(fill= 'both', expand= 'True') #expandir el frame cuando se expande la ventana
        self.frame_principal.config(width="600", height='100') #Definir tamaño del frame principal
        self.frame_principal.place(x=50, y=0)
        
        # Creación de la barra de progreso
        self.frame_progbar= Frame(self.root)
        self.frame_progbar.pack(fill= 'both', expand= 'True') #expandir el frame cuando se expande la ventana
        self.frame_progbar.config(width="650", height='50') #Definir tamaño del frame principal
        self.frame_progbar.place(x=50, y=100)
        
        self.progressbar = ttk.Progressbar(self.frame_progbar, mode='determinate')
        self.progressbar.place(x=25, y=25, width=600)
        
        ## Creacion de las Listbox
        #creacion del frame para las listbox
        self.frame_list_box= Frame(self.root)
        self.frame_list_box.pack(fill= 'both', expand= 'True', pady=50) #expandir el frame cuando se expande la ventana
        # self.frame_list_box.config(width="750", height='700') #Definir tamaño del frame principal
        self.frame_list_box.place(x=50, y=200)
        
        #Creacion de las listbox

        #lista de meses con precios base
        #Etiqueta superior
        self.label_listbox_base= Label(self.frame_list_box, text= 'Meses en la base:')
        self.label_listbox_base.grid(row=0, column= 0, padx=(15,0))#
        #Scrollbar
        self.scrollbar_base = Scrollbar(self.frame_list_box, orient=VERTICAL)
        #Listbox de meses
        self.listbox_base= Listbox(self.frame_list_box, width=18, height= 15, yscrollcommand=self.scrollbar_base.set)
        self.listbox_base.grid(row= 1, column= 0, padx=(15,0))
        #Configuracion scrollbar
        self.scrollbar_base.config(command=self.listbox_base.yview)
        self.scrollbar_base.grid(row= 1, column= 1, sticky=N+S, padx=(0,20))
        #Boton de actualizacion
        self.boton_actualizar_base = Button(self.frame_list_box, text='Actualizar', width=10, command= lambda:[self.esta_procesando.set('Procesando...'), self.actualizar_bases()])
        self.boton_actualizar_base.grid(row=2, column=0, padx=(15,0), pady=20) #
        self.boton_actualizar_base["state"]= "disable"
        
        #lista de meses con precios imputados
        self.label_listbox_imputados= Label(self.frame_list_box, text= 'Meses imputados:')
        self.label_listbox_imputados.grid(row=0, column= 2, padx=(15,0))
        #Scrollbar
        self.scrollbar_imputados = Scrollbar(self.frame_list_box, orient=VERTICAL)
        #Listbox de meses
        self.listbox_imputados= Listbox(self.frame_list_box, width=18, height= 15, yscrollcommand=self.scrollbar_imputados.set)
        self.listbox_imputados.grid(row= 1, column= 2, padx=(15,0))
        #Configuracion scrollbar
        self.scrollbar_imputados.config(command=self.listbox_imputados.yview)
        self.scrollbar_imputados.grid(row= 1, column= 3, sticky=N+S, padx=(0,20))
        #Boton de actualizacion
        self.boton_actualizar_imputados = Button(self.frame_list_box, text='Actualizar', width=10, command= lambda:[self.esta_procesando.set('Procesando...\nPuede tardar unos minutos'), self.imputar_bases()])
        self.boton_actualizar_imputados.grid(row=2, column=2, padx=(15,0), pady=20, )
        self.boton_actualizar_imputados["state"]= "disable"
        
        #lista de meses con precios utilizados claculados
        self.label_listbox_base= Label(self.frame_list_box, text= 'Meses utilizados:')
        self.label_listbox_base.grid(row=0, column= 4, padx=(15,0))
        #Scrollbar
        self.scrollbar_utilizados = Scrollbar(self.frame_list_box, orient=VERTICAL)
        #Listbox de meses
        self.listbox_utilizados= Listbox(self.frame_list_box, width=18, height= 15, yscrollcommand=self.scrollbar_utilizados.set)
        self.listbox_utilizados.grid(row= 1, column= 4, padx=(15,0))
        #Configuracion scrollbar
        self.scrollbar_utilizados.config(command=self.listbox_utilizados.yview)
        self.scrollbar_utilizados.grid(row= 1, column= 5, sticky=N+S, padx=(0,20))
        #Boton de actualizacion
        self.boton_actualizar_utilizados = Button(self.frame_list_box, text='Actualizar', width=10, command= lambda:[self.esta_procesando.set('Procesando...\nPuede tardar unos minutos'), self.incorporar_nuevos()])#incorporar_nuevos
        self.boton_actualizar_utilizados.grid(row=2, column=4, padx=(15,0), pady=20)
        self.boton_actualizar_utilizados["state"]= "disable"
        
        #lista de meses con las variaciones calculadas  
        self.label_listbox_variaciones= Label(self.frame_list_box, text= 'Variaciones mensuales:')
        self.label_listbox_variaciones.grid(row=0, column= 6, columnspan=2)
        #Scrollbar
        self.scrollbar_variaciones = Scrollbar(self.frame_list_box, orient=VERTICAL)
        #Listbox de meses
        self.listbox_variaciones= Listbox(self.frame_list_box, width=18, height= 15, yscrollcommand=self.scrollbar_variaciones.set)
        self.listbox_variaciones.grid(row= 1, column= 6, padx=(15,0))
        #Configuracion scrollbar
        self.scrollbar_variaciones.config(command=self.listbox_variaciones.yview)
        self.scrollbar_variaciones.grid(row= 1, column= 7, sticky=N+S, padx=(0,20))
        #Boton de actualizacion
        self.boton_actualizar_variaciones = Button(self.frame_list_box, text='Actualizar', width=10, command= lambda:[self.esta_procesando.set('Procesando...'), self.calcular_variaciones()])#calcular_variaciones
        self.boton_actualizar_variaciones.grid(row=2, column=6, pady=20)
        self.boton_actualizar_variaciones["state"]= "disable"
        
        ##carga de la lista de archivos y comprobación
        # self.df_bases_limpias= self.obtener_df_archivos(self.dir_BLP)
        
             
        self.comprobar_bases_limpias(self.dir_IPN, self.dir_BLP)   
        self.df_archivos= self.obtener_df_archivos(self.dir_IPN)
        
            
        self.anyo= StringVar(self.frame_principal)
        self.anyos = self.df_archivos['anyo'].unique().tolist()
        
        
        self.label_anyo_base= Label(self.frame_principal, text= 'Año base:', font= 14)
        self.label_anyo_base.grid(row=0, column=0, pady= (20,0), padx= (10,0))#, sticky='e'
        
        self.desplegable_anyo= ttk.Combobox(self.frame_principal, textvariable= self.anyo, value= self.anyos, state='readonly') #OptionMenu(frame_principal, var, *anyos)
        self.desplegable_anyo.current(0)
        self.desplegable_anyo.bind('<<ComboboxSelected>>', self.obtener_meses_desplegable)
        self.desplegable_anyo.grid(row=0, column=1, padx=(10,0), pady= (20,0))#, sticky='w'
        
        # var.set(anyos[-1])
        
        self.label_mes_base= Label(self.frame_principal, text= 'Mes base:', font= 14, width=10)
        self.label_mes_base.grid(row=1, column=0, padx=(10,0), pady= (10,0)) #, sticky='e'
         
        self.mes= StringVar(self.frame_principal)
        self.meses=  self.df_archivos[self.df_archivos['anyo']== self.anyo.get()]['mes'].tolist()
        
        # # var2.set(meses[-1])
        
        self.desplegable_mes= ttk.Combobox(self.frame_principal, value= self.meses, textvariable= self.mes, state='readonly') #OptionMenu(frame_principal, var2, *meses)
        self.desplegable_mes.current(0)
        self.desplegable_mes.grid(row=1, column=1, pady= (10,0), padx=(10,0))
        
        ## Botones añadir y remover
        self.boton_add = Button(self.frame_principal, text='+', width=2, command= self.agregar_IPN)
        self.boton_add.grid(row=0, column=2, padx=(20,0), pady= (10,0))
        
        self.boton_refresh = Button(self.frame_principal, image= self.refresh_ico, command=self.actualizar_IPN)#
        self.boton_refresh.grid(row=1, column=2, padx=(20,0), pady= (10,0))
        # self.boton_refresh["state"]= "disable"
        
        
        ## Info y botones
        self.label_archivo_seleccionado= Label(self.frame_principal, text= 'Archivo seleccionado:', font=("Arial", 10))
        self.label_archivo_seleccionado.grid(row=0, column=3, padx=(30,0), pady= (20,0))
        
        
        self.texto_archivo_seleccionado= Label(self.frame_principal, textvariable= self.nombre_archivo_var, font=("Courier", 10))
        self.texto_archivo_seleccionado.grid(row=0, column=4, padx=(5,0), pady= (20,0), columnspan=2)
        
        self.boton_leer = Button(self.frame_principal, text='Leer', width=10, command=self.abrir_base)
        self.boton_leer.grid(row=1, column=3, padx=(50,0), pady= (10,0))
        
        self.boton_abrir_IPN = Button(self.frame_principal, text='Abrir IPN', width=10, command=lambda: self.abrir_excel('IPN'))
        self.boton_abrir_IPN.grid(row=1, column=4, padx=(30,0), pady= (10,0))#, sticky='w'
        self.boton_abrir_IPN["state"]= "disable"
        
        self.boton_carpeta_IPN = Button(self.frame_principal, image= self.folder_ico, command=lambda: self.abrir_carpeta(self.dir_IPN))
        self.boton_carpeta_IPN.grid(row=1, column=5, padx=(5,50), pady= (10,0), sticky='w')
        
        #Notificación de proceso
        #Creación del frame
        self.pseudo_progbar= Frame(self.root)
        self.pseudo_progbar.pack(fill= 'both', expand= 'True') #expandir el frame cuando se expande la ventana
        self.pseudo_progbar.config(width="750", height='100') #Definir tamaño del frame principal
        self.pseudo_progbar.place(x=0, y=550)
        self.esta_procesando= StringVar(self.pseudo_progbar)
        self.texto_archivo_seleccionado= Label(self.pseudo_progbar, textvariable= self.esta_procesando, font=14, justify=CENTER)#
        self.texto_archivo_seleccionado.place(relx=.5, rely=.3, anchor="center")
        # self.texto_archivo_seleccionado.config(anchor="center")
        
        #Botones de apertura de archivo
        #Creación del frame
        self.botones_finales= Frame(self.root)
        self.botones_finales.pack(fill= 'both', expand= 'True', pady=20) #expandir el frame cuando se expande la ventana
        self.botones_finales.config(width="750", height='100') #Definir tamaño del frame principal
        self.botones_finales.place(x=0, y=650)
        
        self.boton_abrir_serie_precios = Button(self.botones_finales, text='Abrir Serie Precios', width=18, command=lambda: self.abrir_excel('Precios'))
        self.boton_abrir_serie_precios.grid(row=0, column=0, padx=(130,0), pady= (10,0))
        self.boton_abrir_serie_precios["state"]= "disable"
        self.boton_carpeta_serie_precios = Button(self.botones_finales, image= self.folder_ico, command=lambda: self.abrir_carpeta(self.dir_serie_precios))
        self.boton_carpeta_serie_precios.grid(row=0, column=1, padx=(5,75), pady= (10,0), sticky='e')

        self.boton_abrir_serie_variaciones = Button(self.botones_finales, text='Abrir Serie Variaciones', width=18, command=lambda: self.abrir_excel('Variaciones'))
        self.boton_abrir_serie_variaciones.grid(row=0, column=2, padx=(75,0), pady= (10,0))
        self.boton_abrir_serie_variaciones["state"]= "disable"
        self.boton_carpeta_serie_variaciones = Button(self.botones_finales, image= self.folder_ico, command=lambda: self.abrir_carpeta(self.dir_serie_variaciones))
        self.boton_carpeta_serie_variaciones.grid(row=0, column=3, padx=(5,0), pady= (10,0), sticky='e')
        
        # self.label_mail= Label(text='mail', fg='blue', cursor="hand2")
        
        
        self.root.mainloop()   
    ##Intento de barra de progreso indeterminada para los modulos    
    # def bar_init(self):
    #     import threading
    #     # first layer of isolation, note var being passed along to the self.start_bar function
    #     # target is the function being started on a new thread, so the "bar handler" thread
    #     self.start_bar_thread = threading.Thread(target=self.start_indeterm_progbar)
    #     # start the bar handling thread
    #     self.start_bar_thread.start()
        
    # def start_indeterm_progbar(self):
    #     self.progressbar = ttk.Progressbar(self.frame_progbar, mode='indeterminate')
    #     self.progressbar.place(x=25, y=25, width=600)   
    #     self.progressbar.start(10)       
    #     self.root.update_idletasks() 
    
    
    
    
    def info(self):
        messagebox.showinfo('Cálculo del IPC', f'Programa para estimar las variaciones de los precios de las variedades de tratamiento no especial\n\nVersion 1.0\n\nAnte cualquier duda o consulta enviar mail a: jimmy.9v@gmail.com')
    
    def reiniciar(self):
        self.root.destroy()
        mi_app = Aplicacion()
    
    def comprobar_bases_limpias(self, ruta_IPN, ruta_BLP):
        
        rutas=[ruta_IPN, ruta_BLP]
        lista_ruta_IPN= []
        lista_ruta_BLP= []
        
        # print(ruta_IPN, ruta_BLP)

        for root, dirs, files in os.walk(ruta_IPN):
            for name in files:
                if name[-5:] == '.xlsx': #Solo mirar archivos xlsx
                # name = 'SEPTIEMBRE_2020.xlsx'
                    name = name.replace('.xlsx', '')
                    try:
                        str_date_i = name.split('_')
                        dt.strptime(str_date_i[0]+'-'+str_date_i[1], '%B-%Y').date()
                        if len(str_date_i) <= 2:
                            lista_ruta_IPN.append(name) 
                        # print(name)
                    except (ValueError, IndexError):
                        # print(f'{name}: Nombre incorrecto. Nombre correcto: MES_AA.xlsx ')
                        continue
            break
                    
        for root, dirs, files in os.walk(ruta_BLP):
            for name in files:
                if name[-5:] == '.xlsx': #Solo mirar archivos xlsx
                # name = 'SEPTIEMBRE_2020.xlsx'
                    name = name.replace('.xlsx', '')
                    try:
                        str_date_i = name.split('_') 
                        dt.strptime(str_date_i[0]+'-'+str_date_i[1], '%B-%Y').date()
                        if len(str_date_i) <= 2:
                            lista_ruta_BLP.append(name) 
                    except (ValueError, IndexError):
                        # print(f'{name}: Nombre incorrecto. Nombre correcto: MES_AA.xlsx ')
                        continue
            break
                               
        if len(lista_ruta_IPN) < len(lista_ruta_BLP):
            # from os import remove
            for archivo in lista_ruta_IPN:
                lista_ruta_BLP.remove(archivo)
            for archivo in lista_ruta_BLP:
                ruta_archivo = os.path.join(self.path, self.dir_BLP, archivo+'.xlsx')
                print(f'Se eliminará el archivo {archivo} de la carpeta operativa por no poseer un IPN que lo respalde')
                remove(ruta_archivo)
        
        elif len(lista_ruta_IPN) > len(lista_ruta_BLP):
            self.chequear_limpios()
        
        # self.chequear_botones_actualizar()
                
        # print(lista_ruta_1)
        # print(lista_ruta_2)
        # print(lista_ruta_1 == lista_ruta_2)
        
    
    def obtener_df_archivos(self, ruta):
        # import os
        # import pandas as pd
        
        # from datetime import datetime as dt
        # import locale
        # locale.setlocale(locale.LC_ALL, 'esp_esp')
        
        # self.ruta='Bases_precios'
        # path = './'
        
        # self.meses_archivos_IPN= []
       
        for root, dirs, files in os.walk(ruta):
            for name in files:
                if name[-5:] == '.xlsx': #Solo mirar archivos xlsx
                # name = 'SEPTIEMBRE_2020.xlsx'
                    name = name.replace('.xlsx', '')
                    try:
                        str_date_i = name.split('_')
                        dt.strptime(str_date_i[0]+'-'+str_date_i[1], '%B-%Y').date()
                    except (ValueError, IndexError):
                        # print(f'{name}: Nombre incorrecto. Nombre correcto: MES_AA.xlsx ')
                        continue
                    self.lista_archivos.append(name)
            break
        
        #Creacion del df de archivos
        self.df_archivos= pd.DataFrame(self.lista_archivos, columns= ['archivos'])
        self.df_archivos[['mes', 'anyo']] = self.df_archivos['archivos'].str.split('_', 1, expand=True)
        self.df_archivos.drop('archivos', axis= 1, inplace= True)
        self.df_archivos['n_mes'] = self.df_archivos['mes'].apply(lambda x: dt.strftime(dt.strptime(x, '%B'), '%m'))
        self.df_archivos.sort_values(['anyo', 'n_mes'], inplace=True)
        # print(self.lista_archivos)
        
        # creacion de la lista archivos IPN
        for archivo in self.lista_archivos:
            # print(archivo)
            str_date_i = archivo.split('_')
            dt_date_i = dt.strptime(str_date_i[0]+'-'+str_date_i[1], '%B-%Y').date()
            mY_date_i = dt.strftime(dt_date_i, '%Y-%m')
            # print(mY_date_i)
            self.meses_archivos_IPN.append(mY_date_i)
            self.meses_archivos_IPN.sort()
        # print(self.meses_archivos_IPN)
        return self.df_archivos

        
    def agregar_IPN(self):
        from shutil import copyfile
        self.esta_procesando.set('Abriendo Archivo...')
        ruta_previa= ''
        self.ruta_archivo = filedialog.askopenfilename(initialdir= './',
                                                       title= 'Seleccionar archivo',
                                                       filetype= (('Planilla de cálculo', '*.xlsx'),('Planilla de cálculo', '*.xls')))#,('Texto plano', '*.txt')
        
        # if self.ruta_archivo[-3:].lower() == 'txt':
        #     simpledialog.askstring(title="Separador de columnas",
        #                           prompt="Indique cuál es el separador de columnas")
            
        self.df = pd.read_excel(self.ruta_archivo)
        # time.sleep(1)
        self.esta_procesando.set('Comprobando Archivo...')
        # try:
        self.anno_archivo= int(self.df.iloc[0,0])
        self.mes_archivo= int(self.df.iloc[0,1])
        self.date = dt.strptime(str(self.mes_archivo)+'-'+ str(self.anno_archivo), '%m-%Y')
        self.nombre_archivo_salida = self.date.strftime("%B").upper() + '_'+ self.date.strftime("%Y")+ '.xlsx'
        self.nombre_ruta_salida= os.path.join(self.path, self.dir_IPN, self.nombre_archivo_salida)
        # print(self.anno_archivo, self.mes_archivo)
        # print(self.ruta_archivo)
        # print(self.nombre_ruta_salida)
        
        
        if os.path.exists(self.nombre_ruta_salida):
            rescribir= messagebox.askokcancel('Error', 'El archivo ya existe\nDesea reeplazar')  
            if rescribir:
                copyfile(self.ruta_archivo, self.nombre_ruta_salida)
                 
        else:
            copyfile(self.ruta_archivo, self.nombre_ruta_salida)
        
        self.obtener_df_archivos(self.dir_IPN)
        # self.meses=  self.df_archivos[self.df_archivos['anyo']== self.anyo.get()]['mes'].tolist()
        # self.anyos = self.df_archivos['anyo'].unique().tolist()
        # self.desplegable_anyo= ttk.Combobox(self.frame_principal, textvariable= self.anyo, value= self.anyos, state='readonly') #OptionMenu(frame_principal, var, *anyos)
        # self.desplegable_mes= ttk.Combobox(self.frame_principal, value= self.meses, textvariable= self.mes, state='readonly') #OptionMenu(frame_principal, var2, *meses)     
        self.esta_procesando.set('El archivo se ha agregado correctamente.')
        self.reiniciar()
        
        # self.nombre_archivo= self.ruta_archivo.split('/')[-1]
        # self.nombre_archivo_var.set(self.nombre_archivo)
            
        # except:
        #     valor= messagebox.askokcancel('Error', 'Archivo incorecto \nDesea reintentar')
        #     self.ruta_archivo= ruta_previa
        #     self.esta_procesando.set('')
        #     if valor:
        #         self.agregar_IPN()
                        
    # def eliminar_IPN(self):
    #     anyo= self.anyo.get()
    #     mes= self.mes.get()
    #     nombre_archivo= mes+ '_'+ anyo+ '.xlsx'
    #     ruta_excel= os.path.join(self.path, self.dir_IPN, nombre_archivo)
    #     eliminar= messagebox.askokcancel('Error', f'Desea eliminar el archivo IPN:\n{nombre_archivo}')  
    #     if eliminar:
    #         from os import remove
    #         # os.chmod(ruta_excel, 0o777)
    #         remove(ruta_excel)
    #         self.esta_procesando.set('El archivo se ha eliminado correctamente.')
    #         self.reiniciar()
    
    def actualizar_IPN(self):
        actualizar= messagebox.askquestion('Actualizar', f'¿Desea actualizar todas las bases de precios?\nLos precios actuales serán reemplazados y todas las series serán eliminadas')  
        if actualizar == 'yes':
            # os.chmod(ruta_excel, 0o777)
            ruta_precios= os.path.join(self.path, self.dir_serie_precios)
            ruta_variaciones= os.path.join(self.path, self.dir_serie_variaciones)
            
            rutas= [ruta_precios, ruta_variaciones]
            for ruta in rutas:
                print(f'Borrando las series del directorio {ruta}')
                for root, dirs, files in os.walk(ruta):
                    for name in files:
                        if name[-5:] == '.xlsx': #Solo mirar archivos xlsx
                        # name = 'SEPTIEMBRE_2020.xlsx'
                            name = name.replace('.xlsx', '')
                            try:
                                str_date_i = name.split('_')
                                dt.strptime(str_date_i[0]+'-'+str_date_i[1], '%B-%Y').date()
                                file = os.path.join(ruta, name + '.xlsx')
                                remove(file)
                            except (ValueError, IndexError):
                                # print(f'{name}: Nombre incorrecto. Nombre correcto: MES_AA.xlsx ')
                                continue
                            
                    break
                print('Listo!!!\n')
            
            print('Comprobando nuevamente los archivos IPN')
            Aplicacion.chequear_limpios(self, sobreescribir=True)
            
            # self.esta_procesando.set('El archivo se ha eliminado correctamente.')
            self.reiniciar()
            # self.chequear_botones_actualizar()
            # import limpiar_bases
            # limpiar_bases.limpiar_bases('Bases_precios', 'Bases_limpias_precios', guardar=True, sobreescribir=True)
            
            
        
        
    def obtener_meses_desplegable(self, e):
        self.anyo_elegido= self.anyo.get()
        self.meses = self.df_archivos[self.df_archivos['anyo']== self.anyo_elegido]['mes'].tolist()
        self.desplegable_mes.config(value= self.meses)
        self.desplegable_mes.current(0)
        
    def incrementar_progbar(self, q) :
        self.progressbar['value']+= q
    
    def abrir_base(self):
        self.progressbar.stop() #resetear progbar
        # import os
        path= './'
        self.anyo_elegido= self.anyo.get()
        self.mes_elegido= self.mes.get()
        self.nombre_archivo= self.mes_elegido+ '_'+ self.anyo_elegido+ '.xlsx'
        self.nombre_archivo_var.set(self.nombre_archivo)
        self.nomarchivo_to_AAAAmm()
        self.lista_meses_esperados()
        # print(self.fecha_archivo_base)
        
        #Reseteo los listbox
        self.listbox_base.delete(0,'end')
        self.listbox_imputados.delete(0,'end')
        self.listbox_utilizados.delete(0,'end')
        self.listbox_variaciones.delete(0,'end')
        
        
        self.archivo_serie_precios= os.path.join(path, self.dir_serie_precios, self.nombre_archivo)
        self.archivo_serie_variaciones= os.path.join(path, self.dir_serie_variaciones, self.nombre_archivo)
        
        #Reviso que todas las bases en el dir. origen esten preparadas para operar
        self.chequear_limpios()
        
        #Ahora abro las listas de meses y relleno los listbox
        
        self.lista_base= self.obtener_meses_listbox('Precios', self.archivo_serie_precios)
        self.incorporar_meses_listbox(self.lista_base, self.listbox_base)
        self.root.after(50, self.incrementar_progbar(25))
        self.root.update_idletasks()
        
        self.lista_imputados= self.obtener_meses_listbox('Precios imputados', self.archivo_serie_precios)
        self.incorporar_meses_listbox(self.lista_imputados, self.listbox_imputados)
        self.root.after(50, self.incrementar_progbar(25))
        self.root.update_idletasks()
        
        self.lista_utilizados= self.obtener_meses_listbox('Precios utilizados', self.archivo_serie_precios)
        self.incorporar_meses_listbox(self.lista_utilizados, self.listbox_utilizados)
        self.root.after(50, self.incrementar_progbar(25))
        self.root.update_idletasks()
        
        self.lista_variaciones= self.obtener_meses_listbox('Variaciones', self.archivo_serie_variaciones)
        self.incorporar_meses_listbox(self.lista_variaciones, self.listbox_variaciones)
        self.root.after(50, self.incrementar_progbar(25))
        self.root.update_idletasks()
        
        self.boton_abrir_IPN["state"]= "active"
        self.chequear_botones_actualizar()
        # print(self.lista_base, self.lista_columnas_esperada)
        # self.progressbar.stop()
        
        
        # print(self.nombre_archivo)
    def abrir_excel(self, archivo):
        # import os
        # self.nombre_archivo 
        # self.dir_IPN
        if archivo=='IPN':
            ruta_excel= os.path.join(self.path, self.dir_IPN, self.nombre_archivo)
        elif archivo=='Precios':
            ruta_excel= os.path.join(self.path, self.dir_serie_precios, self.nombre_archivo)
        elif archivo=='Variaciones':
            ruta_excel= os.path.join(self.path, self.dir_serie_variaciones, self.nombre_archivo)
        else:
            raise('Parametro incorrecto')
        
        os.startfile(ruta_excel)
        
    def abrir_carpeta(self, carpeta):
        # import os
        ruta= os.path.join(os.getcwd(), carpeta)
        os.startfile(ruta)
    
    def chequear_limpios(self, sobreescribir=False):
        # import limpiar_bases
        if sobreescribir:
            limpiar_bases.limpiar_bases('Bases_precios', 'Bases_limpias_precios', guardar=True, sobreescribir=True)
        else:
            limpiar_bases.limpiar_bases('Bases_precios', 'Bases_limpias_precios', guardar=True)

    
    def obtener_meses_listbox(self, sheet_name, ruta_archivo):
        # import pandas as pd
        try:
            df = pd.read_excel(ruta_archivo, sheet_name= sheet_name)
            lista_meses= df.columns[4:].tolist()
        except OSError:
            print(f'No se ha encontrado el archivo: {ruta_archivo}')
            lista_meses= []
        except ValueError:
            print(f'No se ha encontrado la hoja de cálculo: {sheet_name}')
            lista_meses= []
        
        return lista_meses
    
    def incorporar_meses_listbox(self, lista_meses, listbox):
        for mes in lista_meses:
            listbox.insert(END, mes)
            
    def nomarchivo_to_AAAAmm(self):
        # from datetime import datetime as dt
        # import locale
        # locale.setlocale(locale.LC_ALL, 'esp_esp')
        mes = self.nombre_archivo.replace('.xlsx', '')
        str_date = mes.split('_')
        dt_date = dt.strptime(str_date[0]+'-'+str_date[1], '%B-%Y').date()
        self.fecha_archivo_base= dt.strftime(dt_date, '%Y-%m')

    def lista_meses_esperados(self):
        posicion= self.meses_archivos_IPN.index(self.fecha_archivo_base)
        self.lista_columnas_esperada= self.meses_archivos_IPN[posicion:]
        
    def chequear_botones_actualizar(self):
        print('Comprobación de los archivos de series:')
        print(f'Los meses disponibles para realizar el cálculo son:\n{self.lista_columnas_esperada}')
        
        
        print(f'Los meses agregados a la serie de precios base son:\n{self.lista_base}')
        if self.lista_base != self.lista_columnas_esperada:
            self.boton_actualizar_base["state"]= "active"
            print('Haga click en el boton Actualizar\n')
                    
        else:            
            print(f'Los meses agregados a la serie de precios imputados son:\n{self.lista_imputados}')
            self.boton_actualizar_base["state"]= "disable"
            if self.lista_imputados != self.lista_columnas_esperada:
                self.boton_actualizar_imputados["state"]= "active"
                print('Haga click en el boton Actualizar\n')
                
            else:
                print(f'Los meses agregados a la serie de precios utilizados son:\n{self.lista_utilizados}')
                self.boton_actualizar_imputados["state"]= "disable"
                if self.lista_utilizados != self.lista_columnas_esperada:
                    self.boton_actualizar_utilizados["state"]= "active"
                    print('Haga click en el boton Actualizar\n')
                
                else:
                    print(f'Los meses agregados a la serie de variaciones de precios son:\n{self.lista_variaciones}')
                    self.boton_actualizar_utilizados["state"]= "disable"
                    if self.lista_variaciones != self.lista_columnas_esperada[1:]:
                        self.boton_actualizar_variaciones["state"]= "active"
                    else:
                        self.boton_actualizar_variaciones["state"]= "disable"
                        print('Todas las series se encuentran actualizadas\n')
        
        if self.lista_base or self.lista_imputados or self.lista_utilizados:
            self.boton_abrir_serie_precios["state"]= "active"
        else:
            self.boton_abrir_serie_precios["state"]= "disable"
            
        if self.lista_variaciones:
            self.boton_abrir_serie_variaciones["state"]= "active"
        else:
            self.boton_abrir_serie_variaciones["state"]= "disable"
    
    
    
    # def mover_progbar_t(self, meses_por_actualizar, msec):
    #     porcentaje_progbar= 100/meses_por_actualizar
    #     for i in range(meses_por_actualizar-1):
    #         self.root.after(msec, self.incrementar_progbar(porcentaje_progbar))
    #         self.root.update_idletasks()
    

    
    def actualizar_bases(self):
        # import definir_base
        
        
        self.progressbar.stop() #resetear progbar
        self.root.update_idletasks()        

        
        # meses_por_actualizar= len(self.lista_columnas_esperada)
        # porcentaje_progbar= 100/meses_por_actualizar
        # self.mover_progbar_t(meses_por_actualizar, 500)
        

        definir_base.generar_mes_base(self.nombre_archivo, guardar=True)

        
        #Actualizar Listbox
        self.listbox_base.delete(0,'end')
        self.lista_base= self.obtener_meses_listbox('Precios', self.archivo_serie_precios)
        self.incorporar_meses_listbox(self.lista_base, self.listbox_base)
        # print(self.lista_base, self.lista_columnas_esperada)
        
        self.chequear_botones_actualizar()
        self.esta_procesando.set('Finalizado.')
        
        
        
    def imputar_bases(self):
        self.progressbar.stop() #resetear progbar
        self.root.update_idletasks()
        
        # import imputar_faltantes
        imputar_faltantes.imputar_base(self.nombre_archivo)
        
        #Actualizar Listbox
        self.listbox_imputados.delete(0,'end')
        self.lista_imputados= self.obtener_meses_listbox('Precios imputados', self.archivo_serie_precios)
        self.incorporar_meses_listbox(self.lista_imputados, self.listbox_imputados)
        # print(self.lista_base, self.lista_columnas_esperada)
        self.chequear_botones_actualizar()    
        self.esta_procesando.set('Finalizado.')    
    
    def incorporar_nuevos(self):
        self.progressbar.stop() #resetear progbar
        self.root.update_idletasks()
        
        # import incorporar_precios_nuevos
        incorporar_precios_nuevos.incorporar_precios_nuevos(self.nombre_archivo)
        
        #Actualizar Listbox
        self.listbox_utilizados.delete(0,'end')
        self.lista_utilizados= self.obtener_meses_listbox('Precios utilizados', self.archivo_serie_precios)
        self.incorporar_meses_listbox(self.lista_utilizados, self.listbox_utilizados)
        # print(self.lista_base, self.lista_columnas_esperada)
        self.chequear_botones_actualizar()  
        self.esta_procesando.set('Finalizado.')
        
    def calcular_variaciones(self):
        self.progressbar.stop() #resetear progbar
        self.root.update_idletasks()
        
        # import calcular_variacion_mensual
        calcular_variacion_mensual.calcular_variacion_mensual(self.nombre_archivo)
        
        #Actualizar Listbox
        self.listbox_variaciones.delete(0,'end')
        self.lista_variaciones= self.obtener_meses_listbox('Variaciones', self.archivo_serie_variaciones)
        self.incorporar_meses_listbox(self.lista_variaciones, self.listbox_variaciones)
        # print(self.lista_base, self.lista_columnas_esperada)
        self.chequear_botones_actualizar()  
        self.esta_procesando.set('Finalizado.')
        
mi_app = Aplicacion()
