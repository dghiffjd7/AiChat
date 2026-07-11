use std::io::Cursor;

use base64::Engine as _;
use image::{DynamicImage, ImageFormat};
use serde::Serialize;
use tauri::WebviewWindow;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureViewportRegionResult {
    pub data_url: String,
    pub mime: String,
    pub width: u32,
    pub height: u32,
    pub bytes: usize,
}

#[derive(Debug, Clone, Copy)]
struct CssRegion {
    left: f64,
    top: f64,
    width: f64,
    height: f64,
    viewport_width: f64,
    viewport_height: f64,
    pixel_ratio: f64,
}

fn crop_viewport_png(
    png: &[u8],
    region: CssRegion,
    max_dimension: u32,
) -> Result<(Vec<u8>, u32, u32), String> {
    let image = image::load_from_memory_with_format(png, ImageFormat::Png)
        .map_err(|error| format!("无法解码 WebView 截图：{error}"))?;
    let source_width = image.width();
    let source_height = image.height();
    if source_width == 0 || source_height == 0 {
        return Err("WebView 截图尺寸无效".to_string());
    }
    if ![
        region.left,
        region.top,
        region.width,
        region.height,
        region.viewport_width,
        region.viewport_height,
        region.pixel_ratio,
    ]
    .iter()
    .all(|value| value.is_finite())
        || region.width <= 0.0
        || region.height <= 0.0
    {
        return Err("选区坐标无效".to_string());
    }

    let fallback_ratio = region.pixel_ratio.clamp(0.25, 8.0);
    let scale_x = if region.viewport_width > 0.0 {
        source_width as f64 / region.viewport_width
    } else {
        fallback_ratio
    };
    let scale_y = if region.viewport_height > 0.0 {
        source_height as f64 / region.viewport_height
    } else {
        fallback_ratio
    };
    let x1 = (region.left * scale_x).floor().max(0.0) as u32;
    let y1 = (region.top * scale_y).floor().max(0.0) as u32;
    let x2 = ((region.left + region.width) * scale_x)
        .ceil()
        .clamp(0.0, source_width as f64) as u32;
    let y2 = ((region.top + region.height) * scale_y)
        .ceil()
        .clamp(0.0, source_height as f64) as u32;
    if x1 >= source_width || y1 >= source_height || x2 <= x1 || y2 <= y1 {
        return Err("选区已不在当前 WebView 视口内".to_string());
    }

    let mut cropped = image.crop_imm(x1, y1, x2 - x1, y2 - y1);
    let max_dimension = max_dimension.clamp(64, 4096);
    if cropped.width() > max_dimension || cropped.height() > max_dimension {
        cropped = cropped.resize(
            max_dimension,
            max_dimension,
            image::imageops::FilterType::Lanczos3,
        );
    }
    encode_png(cropped)
}

fn encode_png(image: DynamicImage) -> Result<(Vec<u8>, u32, u32), String> {
    let width = image.width();
    let height = image.height();
    let mut cursor = Cursor::new(Vec::new());
    image
        .write_to(&mut cursor, ImageFormat::Png)
        .map_err(|error| format!("无法编码选区截图：{error}"))?;
    Ok((cursor.into_inner(), width, height))
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn capture_viewport_region(
    window: WebviewWindow,
    left: f64,
    top: f64,
    width: f64,
    height: f64,
    viewport_width: f64,
    viewport_height: f64,
    pixel_ratio: Option<f64>,
    max_dimension: Option<u32>,
) -> Result<CaptureViewportRegionResult, String> {
    let viewport_png = capture_native_viewport(&window)?;
    let (cropped, output_width, output_height) = crop_viewport_png(
        &viewport_png,
        CssRegion {
            left,
            top,
            width,
            height,
            viewport_width,
            viewport_height,
            pixel_ratio: pixel_ratio.unwrap_or(1.0),
        },
        max_dimension.unwrap_or(1600),
    )?;
    let bytes = cropped.len();
    let encoded = base64::engine::general_purpose::STANDARD.encode(cropped);
    Ok(CaptureViewportRegionResult {
        data_url: format!("data:image/png;base64,{encoded}"),
        mime: "image/png".to_string(),
        width: output_width,
        height: output_height,
        bytes,
    })
}

// Windows/Android viewport capture follows the same platform APIs used by the
// MIT-licensed tauri-plugin-mcp-bridge screenshot implementation. Cropping and
// the public command contract are local to this app.
#[cfg(target_os = "windows")]
fn capture_native_viewport(window: &WebviewWindow) -> Result<Vec<u8>, String> {
    use std::sync::mpsc;
    use webview2_com::{
        CapturePreviewCompletedHandler,
        Microsoft::Web::WebView2::Win32::COREWEBVIEW2_CAPTURE_PREVIEW_IMAGE_FORMAT_PNG,
    };
    use windows::Win32::Foundation::HGLOBAL;
    use windows::Win32::System::Com::IStream;
    use windows::Win32::System::Com::StructuredStorage::CreateStreamOnHGlobal;

    let (tx, rx) = mpsc::channel::<Result<Vec<u8>, String>>();
    window
        .with_webview(move |webview| unsafe {
            let result = (|| {
                let controller = webview.controller();
                let core_webview = controller
                    .CoreWebView2()
                    .map_err(|error| format!("无法取得 WebView2：{error}"))?;
                let stream: IStream = CreateStreamOnHGlobal(HGLOBAL::default(), true)
                    .map_err(|error| format!("无法建立截图内存流：{error}"))?;
                let stream_for_handler = stream.clone();
                let tx_for_handler = tx.clone();
                let handler = CapturePreviewCompletedHandler::create(Box::new(move |result| {
                    let captured = match result {
                        Ok(()) => read_stream_to_vec(&stream_for_handler),
                        Err(error) => Err(format!("WebView2 截图失败：{error}")),
                    };
                    let _ = tx_for_handler.send(captured);
                    Ok(())
                }));
                core_webview
                    .CapturePreview(
                        COREWEBVIEW2_CAPTURE_PREVIEW_IMAGE_FORMAT_PNG,
                        &stream,
                        &handler,
                    )
                    .map_err(|error| format!("无法启动 WebView2 截图：{error}"))?;
                Ok::<(), String>(())
            })();
            if let Err(error) = result {
                let _ = tx.send(Err(error));
            }
        })
        .map_err(|error| format!("无法访问 WebView：{error}"))?;

    rx.recv_timeout(std::time::Duration::from_secs(10))
        .map_err(|_| "等待 WebView 截图超时".to_string())?
}

#[cfg(target_os = "windows")]
unsafe fn read_stream_to_vec(
    stream: &windows::Win32::System::Com::IStream,
) -> Result<Vec<u8>, String> {
    use windows::Win32::System::Com::{STREAM_SEEK_END, STREAM_SEEK_SET};

    stream
        .Seek(0, STREAM_SEEK_SET, None)
        .map_err(|error| format!("截图流定位失败：{error}"))?;
    let mut end_position = 0u64;
    stream
        .Seek(0, STREAM_SEEK_END, Some(&mut end_position))
        .map_err(|error| format!("截图流长度读取失败：{error}"))?;
    stream
        .Seek(0, STREAM_SEEK_SET, None)
        .map_err(|error| format!("截图流复位失败：{error}"))?;
    let mut buffer = vec![0u8; end_position as usize];
    let mut bytes_read = 0u32;
    stream
        .Read(
            buffer.as_mut_ptr().cast(),
            buffer.len() as u32,
            Some(&mut bytes_read),
        )
        .ok()
        .map_err(|error| format!("截图流读取失败：{error}"))?;
    buffer.truncate(bytes_read as usize);
    Ok(buffer)
}

#[cfg(target_os = "android")]
fn capture_native_viewport(window: &WebviewWindow) -> Result<Vec<u8>, String> {
    use jni::objects::{JByteArray, JValue};
    use std::sync::mpsc;

    let (tx, rx) = mpsc::channel::<Result<Vec<u8>, String>>();
    window
        .with_webview(move |webview| {
            webview
                .jni_handle()
                .exec(move |env, _activity, webview_obj| {
                    let result = (|| {
                        let width = env
                            .call_method(webview_obj, "getWidth", "()I", &[])
                            .map_err(|error| format!("读取 WebView 宽度失败：{error}"))?
                            .i()
                            .map_err(|error| format!("WebView 宽度无效：{error}"))?;
                        let height = env
                            .call_method(webview_obj, "getHeight", "()I", &[])
                            .map_err(|error| format!("读取 WebView 高度失败：{error}"))?
                            .i()
                            .map_err(|error| format!("WebView 高度无效：{error}"))?;
                        if width <= 0 || height <= 0 {
                            return Err(format!("WebView 尺寸无效：{width}x{height}"));
                        }

                        let bitmap_class = env
                            .find_class("android/graphics/Bitmap")
                            .map_err(|error| format!("找不到 Bitmap：{error}"))?;
                        let config_class = env
                            .find_class("android/graphics/Bitmap$Config")
                            .map_err(|error| format!("找不到 Bitmap.Config：{error}"))?;
                        let argb_8888 = env
                            .get_static_field(
                                &config_class,
                                "ARGB_8888",
                                "Landroid/graphics/Bitmap$Config;",
                            )
                            .map_err(|error| format!("读取 ARGB_8888 失败：{error}"))?
                            .l()
                            .map_err(|error| format!("ARGB_8888 无效：{error}"))?;
                        let bitmap = env
                            .call_static_method(
                                &bitmap_class,
                                "createBitmap",
                                "(IILandroid/graphics/Bitmap$Config;)Landroid/graphics/Bitmap;",
                                &[
                                    JValue::Int(width),
                                    JValue::Int(height),
                                    JValue::Object(&argb_8888),
                                ],
                            )
                            .map_err(|error| format!("建立截图 Bitmap 失败：{error}"))?
                            .l()
                            .map_err(|error| format!("截图 Bitmap 无效：{error}"))?;
                        let canvas_class = env
                            .find_class("android/graphics/Canvas")
                            .map_err(|error| format!("找不到 Canvas：{error}"))?;
                        let canvas = env
                            .new_object(
                                &canvas_class,
                                "(Landroid/graphics/Bitmap;)V",
                                &[JValue::Object(&bitmap)],
                            )
                            .map_err(|error| format!("建立截图 Canvas 失败：{error}"))?;
                        env.call_method(
                            webview_obj,
                            "draw",
                            "(Landroid/graphics/Canvas;)V",
                            &[JValue::Object(&canvas)],
                        )
                        .map_err(|error| format!("绘制 WebView 截图失败：{error}"))?;

                        let output_class = env
                            .find_class("java/io/ByteArrayOutputStream")
                            .map_err(|error| format!("找不到 ByteArrayOutputStream：{error}"))?;
                        let output = env
                            .new_object(&output_class, "()V", &[])
                            .map_err(|error| format!("建立截图输出流失败：{error}"))?;
                        let format_class = env
                            .find_class("android/graphics/Bitmap$CompressFormat")
                            .map_err(|error| format!("找不到 Bitmap.CompressFormat：{error}"))?;
                        let png_format = env
                            .get_static_field(
                                &format_class,
                                "PNG",
                                "Landroid/graphics/Bitmap$CompressFormat;",
                            )
                            .map_err(|error| format!("读取 PNG 格式失败：{error}"))?
                            .l()
                            .map_err(|error| format!("PNG 格式无效：{error}"))?;
                        env.call_method(
                            &bitmap,
                            "compress",
                            "(Landroid/graphics/Bitmap$CompressFormat;ILjava/io/OutputStream;)Z",
                            &[
                                JValue::Object(&png_format),
                                JValue::Int(100),
                                JValue::Object(&output),
                            ],
                        )
                        .map_err(|error| format!("压缩 WebView 截图失败：{error}"))?;
                        let byte_array = env
                            .call_method(&output, "toByteArray", "()[B", &[])
                            .map_err(|error| format!("读取截图字节失败：{error}"))?
                            .l()
                            .map_err(|error| format!("截图字节数组无效：{error}"))?;
                        let byte_array = JByteArray::from(byte_array);
                        let length = env
                            .get_array_length(&byte_array)
                            .map_err(|error| format!("读取截图长度失败：{error}"))?
                            as usize;
                        let mut signed = vec![0i8; length];
                        env.get_byte_array_region(&byte_array, 0, &mut signed)
                            .map_err(|error| format!("复制截图字节失败：{error}"))?;
                        let _ = env.call_method(&bitmap, "recycle", "()V", &[]);
                        Ok(signed.into_iter().map(|byte| byte as u8).collect())
                    })();
                    let _ = tx.send(result);
                });
        })
        .map_err(|error| format!("无法访问 Android WebView：{error}"))?;
    rx.recv_timeout(std::time::Duration::from_secs(10))
        .map_err(|_| "等待 Android WebView 截图超时".to_string())?
}

#[cfg(not(any(target_os = "windows", target_os = "android")))]
fn capture_native_viewport(_window: &WebviewWindow) -> Result<Vec<u8>, String> {
    Err("当前平台暂不支持原生 WebView 截图".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{Rgba, RgbaImage};

    fn test_png(width: u32, height: u32) -> Vec<u8> {
        let image = RgbaImage::from_fn(width, height, |x, y| {
            Rgba([(x * 20) as u8, (y * 20) as u8, 120, 255])
        });
        let mut cursor = Cursor::new(Vec::new());
        DynamicImage::ImageRgba8(image)
            .write_to(&mut cursor, ImageFormat::Png)
            .unwrap();
        cursor.into_inner()
    }

    #[test]
    fn crops_css_region_at_one_to_one_scale() {
        let (png, width, height) = crop_viewport_png(
            &test_png(4, 4),
            CssRegion {
                left: 1.0,
                top: 1.0,
                width: 2.0,
                height: 2.0,
                viewport_width: 4.0,
                viewport_height: 4.0,
                pixel_ratio: 1.0,
            },
            1600,
        )
        .unwrap();
        assert_eq!((width, height), (2, 2));
        assert!(!png.is_empty());
    }

    #[test]
    fn derives_dpi_scale_from_screenshot_and_css_viewport() {
        let (_, width, height) = crop_viewport_png(
            &test_png(8, 8),
            CssRegion {
                left: 1.0,
                top: 1.0,
                width: 2.0,
                height: 2.0,
                viewport_width: 4.0,
                viewport_height: 4.0,
                pixel_ratio: 1.0,
            },
            1600,
        )
        .unwrap();
        assert_eq!((width, height), (4, 4));
    }
}
