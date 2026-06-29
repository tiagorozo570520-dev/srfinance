import os
import sqlite3

def initialize_database():
    db_name = "sr_finance.db"
    schema_name = "schema.sql"
    
    print(f"Inicializando base de datos SQLite '{db_name}'...")
    
    # Verificar que el esquema existe
    if not os.path.exists(schema_name):
        print(f"Error: No se encontró el archivo '{schema_name}'")
        return
        
    try:
        # Conectar (creará el archivo si no existe)
        conn = sqlite3.connect(db_name)
        cursor = conn.cursor()
        
        # Leer y ejecutar el esquema
        with open(schema_name, 'r', encoding='utf-8') as f:
            sql_script = f.read()
            
        cursor.executescript(sql_script)
        conn.commit()
        print(f"Esquema de base de datos aplicado correctamente desde '{schema_name}'.")
        
        # Verificar tablas creadas
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = cursor.fetchall()
        print("Tablas creadas:")
        for table in tables:
            print(f"- {table[0]}")
            
        conn.close()
        print("Conexión cerrada. Base de datos lista.")
        
    except sqlite3.Error as e:
        print(f"Ocurrió un error de SQLite: {e}")
    except Exception as e:
        print(f"Ocurrió un error inesperado: {e}")

if __name__ == "__main__":
    initialize_database()
