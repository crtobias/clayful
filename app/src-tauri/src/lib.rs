use std::path::PathBuf;
use std::process::Command;
use tauri::ipc::{InvokeBody, Request, Response};

/// Lee una cabecera codificada con encodeURIComponent.
fn header(request: &Request<'_>, name: &str) -> Result<String, String> {
    let raw = request
        .headers()
        .get(name)
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| format!("falta la cabecera {name}"))?;
    urlencoding::decode(raw).map(|s| s.into_owned()).map_err(|e| e.to_string())
}

fn body(request: &Request<'_>) -> Result<Vec<u8>, String> {
    match request.body() {
        InvokeBody::Raw(data) => Ok(data.clone()),
        _ => Err("se esperaban bytes".into()),
    }
}

/// Escribe bytes en la ruta que eligió el usuario con el diálogo de guardar.
#[tauri::command]
fn write_file(request: Request<'_>) -> Result<(), String> {
    let path = PathBuf::from(header(&request, "x-path")?);
    std::fs::write(path, body(&request)?).map_err(|e| e.to_string())
}

/// Guarda bytes en una carpeta temporal propia y devuelve la ruta.
#[tauri::command]
fn write_temp(request: Request<'_>) -> Result<String, String> {
    let name = header(&request, "x-name")?;
    let file_name = PathBuf::from(&name)
        .file_name()
        .map(|n| n.to_owned())
        .ok_or("nombre inválido")?;
    let dir = std::env::temp_dir().join("clayful");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(file_name);
    std::fs::write(&path, body(&request)?).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

fn find_blender() -> Option<PathBuf> {
    if let Ok(p) = std::env::var("CLAYFUL_BLENDER") {
        return Some(PathBuf::from(p));
    }
    let exe = if cfg!(windows) { "blender.exe" } else { "blender" };
    if let Some(paths) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&paths) {
            let candidate = dir.join(exe);
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    let known = [
        "/Applications/Blender.app/Contents/MacOS/Blender",
        "/usr/bin/blender",
        "/snap/bin/blender",
    ];
    known.iter().map(PathBuf::from).find(|p| p.is_file())
}

/// Convierte un .blend a GLB con Blender en segundo plano. Devuelve los bytes del GLB.
#[tauri::command]
async fn convert_blend(path: String) -> Result<Response, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let blender = find_blender()
            .ok_or("No encontré Blender. Instalalo o exportá el archivo a GLB.")?;
        let output = std::env::temp_dir().join("clayful").join("convertido.glb");
        let script = format!(
            "import bpy; bpy.ops.export_scene.gltf(filepath={:?}, export_format='GLB')",
            output.to_string_lossy()
        );
        let status = Command::new(blender)
            .arg("-b")
            .arg(&path)
            .arg("--python-expr")
            .arg(script)
            .status()
            .map_err(|e| e.to_string())?;
        if !status.success() {
            return Err("Blender no pudo convertir el archivo.".to_string());
        }
        let bytes = std::fs::read(&output).map_err(|e| e.to_string())?;
        let _ = std::fs::remove_file(&output);
        let _ = std::fs::remove_file(&path);
        Ok(Response::new(bytes))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![write_file, write_temp, convert_blend])
        .run(tauri::generate_context!())
        .expect("no se pudo iniciar Clayful");
}
