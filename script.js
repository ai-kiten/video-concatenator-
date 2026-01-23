// ========================================
// グローバル変数
// ========================================
let videoFiles = [];
let catchVideos = [];
let bodyVideos = [];
let bgmFile = null;
let ffmpeg = null;
let ffmpegLoaded = false;
let completedVideos = [];

// ========================================
// DOM要素の取得
// ========================================
const DOM = {
    // 動画入力関連
    videoInput: document.getElementById('videoInput'),
    videoDropZone: document.getElementById('videoDropZone'),
    videoCount: document.getElementById('videoCount'),
    videoList: document.getElementById('videoList'),

    // BGM関連
    bgmInput: document.getElementById('bgmInput'),
    bgmDropZone: document.getElementById('bgmDropZone'),
    bgmText: document.getElementById('bgmText'),
    bgmVolumeSection: document.getElementById('bgmVolumeSection'),
    bgmVolume: document.getElementById('bgmVolume'),
    bgmVolumeValue: document.getElementById('bgmVolumeValue'),

    // 速度調整
    speedInput: document.getElementById('speedInput'),

    // ペア表示
    pairsContainer: document.getElementById('pairsContainer'),
    pairsList: document.getElementById('pairsList'),

    // 処理・進捗
    processBtn: document.getElementById('processBtn'),
    progress: document.getElementById('progress'),
    progressBar: document.getElementById('progressBar'),
    progressText: document.getElementById('progressText'),

    // 結果表示
    results: document.getElementById('results'),
    resultsList: document.getElementById('resultsList'),
    downloadAllBtn: document.getElementById('downloadAllBtn')
};

// ========================================
// FFmpeg初期化
// ========================================
async function loadFFmpeg() {
    if (ffmpegLoaded) return;

    try {
        const { FFmpeg } = window.FFmpegWASM || {};
        const { toBlobURL } = window.FFmpegUtil || {};

        if (!FFmpeg || !toBlobURL) {
            throw new Error('FFmpegライブラリが読み込まれていません');
        }

        ffmpeg = new FFmpeg();

        ffmpeg.on('log', ({ message }) => {
            console.log('[FFmpeg]', message);
        });

        ffmpeg.on('progress', ({ progress, time }) => {
            console.log(`[FFmpeg] Progress: ${(progress * 100).toFixed(1)}%, Time: ${time}`);
        });

        const baseURL = '/dist';
        await ffmpeg.load({
            coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
            wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
            workerURL: await toBlobURL(`${baseURL}/ffmpeg-core.worker.js`, 'text/javascript'),
        });

        ffmpegLoaded = true;
        console.log('✓ FFmpeg読み込み成功');
    } catch (error) {
        console.error('FFmpeg読み込みエラー:', error);
        throw new Error(`FFmpegの読み込みに失敗: ${error.message}`);
    }
}

// ========================================
// ユーティリティ関数
// ========================================
async function fileToUint8Array(file) {
    return new Uint8Array(await file.arrayBuffer());
}

function getFileNameWithoutExtension(fileName) {
    return fileName.replace(/\.[^/.]+$/, '');
}

function isVideoFile(file) {
    return file.type.startsWith('video/');
}

function isMP3File(file) {
    return file.type === 'audio/mpeg' || file.name.toLowerCase().endsWith('.mp3');
}

function isDuplicateFile(file, existingFiles) {
    return existingFiles.some(existing =>
        existing.name === file.name && existing.size === file.size
    );
}

// ========================================
// 動画ファイル管理
// ========================================
function classifyVideos() {
    catchVideos = [];
    bodyVideos = [];

    videoFiles.forEach((file, index) => {
        const videoData = { file, index };
        // ファイル名の先頭部分で判定（「キャッチ」「冒頭」が先に出現するか確認）
        const catchIndex = Math.min(
            file.name.indexOf('キャッチ') !== -1 ? file.name.indexOf('キャッチ') : Infinity,
            file.name.indexOf('冒頭') !== -1 ? file.name.indexOf('冒頭') : Infinity
        );
        const bodyIndex = file.name.indexOf('ボディ') !== -1 ? file.name.indexOf('ボディ') : Infinity;

        if (catchIndex < bodyIndex) {
            catchVideos.push(videoData);
        } else if (bodyIndex < Infinity) {
            bodyVideos.push(videoData);
        } else {
            // どちらも含まれていない場合はボディとして扱う
            bodyVideos.push(videoData);
        }
    });
}

function handleVideoFiles(files) {
    const videoFilesArray = Array.from(files).filter(isVideoFile);

    const newFiles = videoFilesArray.filter(file => {
        const isDuplicate = isDuplicateFile(file, videoFiles);
        if (isDuplicate) {
            console.log(`重複ファイルをスキップ: ${file.name}`);
        }
        return !isDuplicate;
    });

    if (newFiles.length === 0 && videoFilesArray.length > 0) {
        alert('選択されたファイルはすべて既にアップロード済みです');
        return;
    }

    videoFiles = [...videoFiles, ...newFiles];
    classifyVideos();
    updateVideoList();
    DOM.videoCount.textContent = `${videoFiles.length}ファイル`;

    if (catchVideos.length > 0 && bodyVideos.length > 0) {
        generatePairsList();
    }
}

function removeVideo(index) {
    videoFiles.splice(index, 1);
    classifyVideos();
    updateVideoList();
    DOM.videoCount.textContent = `${videoFiles.length}ファイル`;

    if (catchVideos.length > 0 && bodyVideos.length > 0) {
        generatePairsList();
    } else {
        DOM.pairsContainer.style.display = 'none';
        DOM.processBtn.disabled = true;
    }
}

function clearAllVideos() {
    videoFiles = [];
    catchVideos = [];
    bodyVideos = [];
    updateVideoList();
    DOM.videoCount.textContent = '0ファイル';
    DOM.pairsContainer.style.display = 'none';
    DOM.processBtn.disabled = true;
    DOM.videoInput.value = '';
}

// ========================================
// UI更新関数
// ========================================
function updateVideoList() {
    DOM.videoList.innerHTML = '';

    if (videoFiles.length === 0) {
        DOM.videoList.innerHTML = '<div style="padding: 24px; text-align: center; color: var(--color-text-secondary); font-size: var(--font-size-sm);">ファイルがありません</div>';
        return;
    }

    // すべてクリアボタン
    const clearAllContainer = document.createElement('div');
    clearAllContainer.style.cssText = 'padding: 8px 12px; border-bottom: 1px solid var(--color-border); display: flex; justify-content: flex-end;';

    const clearAllBtn = document.createElement('button');
    clearAllBtn.textContent = 'すべてクリア';
    clearAllBtn.style.cssText = 'padding: 6px 12px; font-size: 12px; background: #ef4444; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 500;';
    clearAllBtn.onclick = () => {
        if (confirm(`${videoFiles.length}個の動画をすべて削除してよろしいですか？`)) {
            clearAllVideos();
        }
    };
    clearAllBtn.onmouseover = () => clearAllBtn.style.background = '#dc2626';
    clearAllBtn.onmouseout = () => clearAllBtn.style.background = '#ef4444';

    clearAllContainer.appendChild(clearAllBtn);
    DOM.videoList.appendChild(clearAllContainer);

    // ファイルリスト
    videoFiles.forEach((file, index) => {
        const item = document.createElement('div');
        item.className = 'file-item';

        const name = document.createElement('span');
        let fileType = '[ボディ]';
        if (file.name.includes('キャッチ')) {
            fileType = '[キャッチ]';
        } else if (file.name.includes('冒頭')) {
            fileType = '[冒頭]';
        }
        name.textContent = `${fileType} ${file.name}`;
        name.style.cssText = 'overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';

        const removeBtn = document.createElement('button');
        removeBtn.className = 'file-remove';
        removeBtn.innerHTML = '×';
        removeBtn.onclick = () => removeVideo(index);

        item.appendChild(name);
        item.appendChild(removeBtn);
        DOM.videoList.appendChild(item);
    });
}

function generatePairsList() {
    const totalVideos = catchVideos.length * bodyVideos.length;

    if (totalVideos === 0) {
        DOM.pairsContainer.style.display = 'none';
        DOM.processBtn.disabled = true;
        return;
    }

    DOM.pairsContainer.style.display = 'block';
    DOM.processBtn.disabled = false;
    DOM.pairsList.innerHTML = '';

    catchVideos.forEach(catchVideo => {
        bodyVideos.forEach(bodyVideo => {
            const item = document.createElement('div');
            item.className = 'pair-item';

            const info = document.createElement('div');
            info.className = 'pair-info';

            const catchName = document.createElement('span');
            catchName.className = 'pair-video-name';
            catchName.textContent = catchVideo.file.name;

            const separator = document.createElement('span');
            separator.className = 'pair-separator';
            separator.textContent = '→';

            const bodyName = document.createElement('span');
            bodyName.className = 'pair-video-name';
            bodyName.textContent = bodyVideo.file.name;

            info.appendChild(catchName);
            info.appendChild(separator);
            info.appendChild(bodyName);

            if (bgmFile) {
                const badge = document.createElement('span');
                badge.style.cssText = 'font-size: 11px; color: #667eea; font-weight: 600; margin-left: 8px;';
                badge.textContent = '(BGM付き)';
                info.appendChild(badge);
            }

            item.appendChild(info);
            DOM.pairsList.appendChild(item);
        });
    });

    const pairsHeader = document.querySelector('.pairs-header');
    pairsHeader.textContent = `連結リスト（${totalVideos}個の動画を生成）`;
}

function addResultItem(name, videoBlob) {
    const item = document.createElement('div');
    item.className = 'result-item';

    const nameElement = document.createElement('div');
    nameElement.className = 'result-name';
    nameElement.textContent = name;

    const video = document.createElement('video');
    video.className = 'result-video';
    video.controls = true;
    video.src = URL.createObjectURL(videoBlob);

    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'result-download';
    downloadBtn.textContent = 'ダウンロード';
    downloadBtn.onclick = () => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(videoBlob);
        a.download = name;
        a.click();
    };

    item.appendChild(nameElement);
    item.appendChild(video);
    item.appendChild(downloadBtn);
    DOM.resultsList.appendChild(item);
}

// ========================================
// BGM管理
// ========================================
function handleBGMFile(file) {
    if (!isMP3File(file)) {
        alert('MP3ファイルのみアップロード可能です');
        return;
    }

    bgmFile = file;
    DOM.bgmText.textContent = file.name;
    DOM.bgmVolumeSection.style.display = 'block';

    if (catchVideos.length > 0 && bodyVideos.length > 0) {
        generatePairsList();
    }
}

// ========================================
// 動画連結処理（最速版）
// ========================================
async function concatenateVideos(catchFile, bodyFile, outputName) {
    const timestamp = Date.now();
    const catchFileName = `catch_${timestamp}.mp4`;
    const bodyFileName = `body_${timestamp}.mp4`;
    const bgmFileName = bgmFile ? `bgm_${timestamp}.mp3` : null;
    const concatFileName = `concat_${timestamp}.txt`;
    const outputFileName = `output_${timestamp}.mp4`;

    try {
        console.log(`[連結開始] ${catchFile.name} + ${bodyFile.name}`);

        // 設定取得
        const speed = parseFloat(DOM.speedInput.value) || 1.0;
        const hasSpeedChange = Math.abs(speed - 1.0) > 0.001;
        const bgmVol = bgmFile ? (parseFloat(DOM.bgmVolume.value) / 100) : 0;

        // ファイル書き込み
        console.log(`ファイル書き込み開始...`);
        const catchData = await fileToUint8Array(catchFile);
        console.log(`キャッチ動画データ取得完了: ${(catchData.byteLength / 1024 / 1024).toFixed(2)} MB`);
        await ffmpeg.writeFile(catchFileName, catchData);
        console.log(`✓ キャッチ動画書き込み完了: ${catchFileName}`);

        const bodyData = await fileToUint8Array(bodyFile);
        console.log(`ボディ動画データ取得完了: ${(bodyData.byteLength / 1024 / 1024).toFixed(2)} MB`);
        await ffmpeg.writeFile(bodyFileName, bodyData);
        console.log(`✓ ボディ動画書き込み完了: ${bodyFileName}`);

        if (bgmFileName) {
            const bgmData = await fileToUint8Array(bgmFile);
            console.log(`BGMデータ取得完了: ${(bgmData.byteLength / 1024 / 1024).toFixed(2)} MB`);
            await ffmpeg.writeFile(bgmFileName, bgmData);
            console.log(`✓ BGM書き込み完了: ${bgmFileName}`);
        }

        // モード選択: 超高速モード vs BGM高速モード vs 通常モード
        if (!hasSpeedChange && !bgmFileName) {
            // BGMなし・速度調整なし → 超高速モード（完全コピー）
            await processWithCopyMode(catchFileName, bodyFileName, concatFileName, outputFileName);
        } else if (!hasSpeedChange && bgmFileName) {
            // BGMあり・速度調整なし → BGM高速モード（映像コピー、音声のみ処理）
            await processWithBGMFastMode(catchFileName, bodyFileName, bgmFileName, outputFileName, bgmVol);
        } else {
            // 速度調整あり → 通常モード（完全再エンコード）
            await processWithReencode(catchFileName, bodyFileName, bgmFileName, outputFileName, speed, hasSpeedChange, bgmVol);
        }

        // 出力ファイル読み込み
        const data = await ffmpeg.readFile(outputFileName);
        console.log(`✓ 出力ファイル読み込み完了: ${(data.byteLength / 1024 / 1024).toFixed(2)} MB`);

        // クリーンアップ
        await cleanupTempFiles(catchFileName, bodyFileName, bgmFileName, concatFileName, outputFileName);

        return new Blob([data.buffer], { type: 'video/mp4' });

    } catch (error) {
        console.error('FFmpeg実行エラー:', error);
        console.error('エラースタック:', error.stack);

        // エラーメッセージを詳細に
        let errorMsg = 'unknown error';
        if (error && error.message) {
            errorMsg = error.message;
        } else if (typeof error === 'string') {
            errorMsg = error;
        }

        throw new Error(`動画連結に失敗: ${errorMsg}`);
    }
}

// 超高速モード（コピーのみ、再エンコードなし）
async function processWithCopyMode(catchFileName, bodyFileName, concatFileName, outputFileName) {
    console.log('FFmpeg実行中（超高速モード - 再エンコードなし）...');

    const concatList = `file '${catchFileName}'\nfile '${bodyFileName}'`;
    await ffmpeg.writeFile(concatFileName, new TextEncoder().encode(concatList));
    console.log('✓ Concatファイル作成完了');

    try {
        console.log('超高速モード: concatプロトコルを使用');
        await ffmpeg.exec([
            '-f', 'concat',
            '-safe', '0',
            '-i', concatFileName,
            '-c', 'copy',
            '-movflags', 'faststart',
            '-y',
            outputFileName
        ]);
        console.log('✓ 超高速モード成功（concatプロトコル）');
    } catch (copyError) {
        console.log('超高速モード失敗、filter_complexで再試行...');
        console.error('Copyモードエラー:', copyError);

        try {
            await ffmpeg.exec([
                '-i', catchFileName,
                '-i', bodyFileName,
                '-filter_complex', '[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[outv][outa]',
                '-map', '[outv]',
                '-map', '[outa]',
                '-c:v', 'libx264',
                '-preset', 'ultrafast',
                '-crf', '28',
                '-c:a', 'aac',
                '-b:a', '128k',
                '-movflags', 'faststart',
                '-threads', '0',
                '-y',
                outputFileName
            ]);
            console.log('✓ フォールバック成功（filter_complex）');
        } catch (fallbackError) {
            console.error('フォールバックもエラー:', fallbackError);
            throw new Error(`動画連結失敗: ${fallbackError.message || 'unknown error'}`);
        }
    }
}

// BGM高速モード（映像・音声処理）
async function processWithBGMFastMode(catchFileName, bodyFileName, bgmFileName, outputFileName, bgmVol) {
    console.log('FFmpeg実行中（BGM付きモード）...');

    // BGMがある場合は再エンコードが必要（コピーモードは使えない）
    await ffmpeg.exec([
        '-i', catchFileName,
        '-i', bodyFileName,
        '-i', bgmFileName,
        '-filter_complex', `[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[outv][outa];[outa]volume=1.0[mainaud];[2:a]volume=${bgmVol.toFixed(2)}[bgmaud];[mainaud][bgmaud]amix=inputs=2:duration=first[outa]`,
        '-map', '[outv]',
        '-map', '[outa]',
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '28',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-ar', '48000',
        '-movflags', 'faststart',
        '-threads', '0',
        '-y',
        outputFileName
    ]);
    console.log('✓ BGM付きモード成功');
}

// 通常モード（再エンコード、速度調整・BGM対応）
async function processWithReencode(catchFileName, bodyFileName, bgmFileName, outputFileName, speed, hasSpeedChange, bgmVol) {
    console.log('FFmpeg実行中（速度調整/BGM対応モード）...');

    const filterComplex = buildFilterComplex(hasSpeedChange, bgmFileName, speed, bgmVol);
    const ffmpegArgs = buildFFmpegArgs(catchFileName, bodyFileName, bgmFileName, filterComplex, outputFileName);

    await ffmpeg.exec(ffmpegArgs);
    console.log('✓ FFmpeg実行完了');
}

// フィルター構築
function buildFilterComplex(hasSpeedChange, bgmFileName, speed, bgmVol) {
    const speedFilter = hasSpeedChange ? `setpts=${(1/speed).toFixed(6)}*PTS` : null;
    const audioSpeedFilter = hasSpeedChange ? `atempo=${speed.toFixed(6)}` : null;

    if (bgmFileName) {
        if (hasSpeedChange) {
            return `[0:v]${speedFilter}[v0];[0:a]${audioSpeedFilter}[a0];[1:v]${speedFilter}[v1];[1:a]${audioSpeedFilter}[a1];[v0][a0][v1][a1]concat=n=2:v=1:a=1[outv][outa];[outa]volume=1.0[mainaud];[2:a]volume=${bgmVol.toFixed(2)}[bgmaud];[mainaud][bgmaud]amix=inputs=2:duration=first[outa]`;
        } else {
            return `[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[outv][outa];[outa]volume=1.0[mainaud];[2:a]volume=${bgmVol.toFixed(2)}[bgmaud];[mainaud][bgmaud]amix=inputs=2:duration=first[outa]`;
        }
    } else if (hasSpeedChange) {
        return `[0:v]${speedFilter}[v0];[0:a]${audioSpeedFilter}[a0];[1:v]${speedFilter}[v1];[1:a]${audioSpeedFilter}[a1];[v0][a0][v1][a1]concat=n=2:v=1:a=1[outv][outa]`;
    }

    return '[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[outv][outa]';
}

// FFmpeg引数構築
function buildFFmpegArgs(catchFileName, bodyFileName, bgmFileName, filterComplex, outputFileName) {
    const args = ['-i', catchFileName, '-i', bodyFileName];

    if (bgmFileName) {
        args.push('-i', bgmFileName);
    }

    args.push(
        '-filter_complex', filterComplex,
        '-map', '[outv]',
        '-map', '[outa]',
        '-c:v', 'libx264',
        '-preset', 'ultrafast',      // 最速プリセット
        '-crf', '28',                // 速度最優先
        '-tune', 'zerolatency',      // レイテンシー最小化
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-b:a', '128k',              // 音質下げて高速化
        '-ar', '44100',              // サンプルレート下げて高速化
        '-movflags', 'faststart',
        '-threads', '0',
        '-y',
        outputFileName
    );

    return args;
}

// 一時ファイルクリーンアップ
async function cleanupTempFiles(catchFileName, bodyFileName, bgmFileName, concatFileName, outputFileName) {
    try {
        await ffmpeg.deleteFile(catchFileName);
        await ffmpeg.deleteFile(bodyFileName);
        if (bgmFileName) await ffmpeg.deleteFile(bgmFileName);
        if (concatFileName) await ffmpeg.deleteFile(concatFileName);
        await ffmpeg.deleteFile(outputFileName);
        console.log('✓ 一時ファイル削除完了');
    } catch (e) {
        console.warn('クリーンアップエラー:', e);
    }
}

// ========================================
// メイン処理
// ========================================
async function processAllVideos() {
    if (catchVideos.length === 0 || bodyVideos.length === 0) {
        alert('キャッチ動画とボディ動画の両方をアップロードしてください');
        return;
    }

    DOM.processBtn.disabled = true;
    DOM.progress.style.display = 'block';
    DOM.results.style.display = 'none';
    DOM.resultsList.innerHTML = '';
    completedVideos = [];
    DOM.progressText.textContent = 'FFmpegを読み込み中...';
    DOM.progressBar.style.width = '0%';

    try {
        await loadFFmpeg();

        // BGMありの場合は1パターンのみ生成
        const totalPairs = catchVideos.length * bodyVideos.length;
        let currentPair = 0;

        for (const catchVideo of catchVideos) {
            for (const bodyVideo of bodyVideos) {
                currentPair++;
                DOM.progressText.textContent = `処理中... (${currentPair}/${totalPairs})`;
                DOM.progressBar.style.width = `${(currentPair / totalPairs) * 100}%`;

                const catchName = getFileNameWithoutExtension(catchVideo.file.name);
                const bodyName = getFileNameWithoutExtension(bodyVideo.file.name);
                const outputName = `${catchName}_${bodyName}.mp4`;

                try {
                    const result = await concatenateVideos(catchVideo.file, bodyVideo.file, outputName);
                    addResultItem(outputName, result);
                    completedVideos.push({ name: outputName, blob: result });
                } catch (error) {
                    console.error(`連結失敗: ${outputName}`, error);
                    console.error('エラー詳細:', error.message, error.stack);
                    alert(`${outputName}の連結に失敗しました\n\nエラー: ${error.message}`);
                }
            }
        }

        DOM.progressText.textContent = '完了しました！';
        DOM.progressBar.style.width = '100%';
        DOM.results.style.display = 'block';

    } catch (error) {
        console.error('処理エラー:', error);
        alert(error.message || '処理中にエラーが発生しました');
        DOM.progressText.textContent = 'エラーが発生しました';
    } finally {
        DOM.processBtn.disabled = false;
    }
}

// ========================================
// ZIP一括ダウンロード
// ========================================
async function downloadAllAsZip() {
    if (completedVideos.length === 0) {
        alert('ダウンロードする動画がありません');
        return;
    }

    try {
        DOM.downloadAllBtn.disabled = true;
        DOM.downloadAllBtn.textContent = 'ZIP作成中...';

        console.log(`ZIP作成開始: ${completedVideos.length}個の動画`);

        const zip = new JSZip();
        const folder = zip.folder('連結動画');

        // すべての動画をZIPに追加
        for (const video of completedVideos) {
            console.log(`ZIPに追加: ${video.name} (${(video.blob.size / 1024 / 1024).toFixed(2)} MB)`);
            folder.file(video.name, video.blob);
        }

        // ZIP生成（プログレス表示付き）
        const zipBlob = await zip.generateAsync({
            type: 'blob',
            compression: 'STORE'  // 動画は既に圧縮済みなので無圧縮で高速化
        }, (metadata) => {
            const progress = metadata.percent.toFixed(0);
            DOM.downloadAllBtn.textContent = `ZIP作成中... ${progress}%`;
        });

        console.log(`ZIP作成完了: ${(zipBlob.size / 1024 / 1024).toFixed(2)} MB`);

        // ダウンロード実行
        const url = URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `連結動画_${new Date().toISOString().slice(0, 10)}.zip`;
        document.body.appendChild(a);  // DOMに追加（一部ブラウザで必要）
        a.click();

        // クリーンアップ（少し遅延させる）
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            console.log('✓ ZIPダウンロード完了');
        }, 100);

        alert(`${completedVideos.length}個の動画をZIPファイルでダウンロードしました`);
    } catch (error) {
        console.error('ZIP作成エラー:', error);
        alert(`ZIPファイルの作成に失敗しました: ${error.message}`);
    } finally {
        DOM.downloadAllBtn.disabled = false;
        DOM.downloadAllBtn.textContent = 'すべてダウンロード';
    }
}

// ========================================
// イベントリスナー登録
// ========================================
// 動画ファイル
DOM.videoInput.addEventListener('change', (e) => handleVideoFiles(e.target.files));

DOM.videoDropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    DOM.videoDropZone.classList.add('drag-over');
});

DOM.videoDropZone.addEventListener('dragleave', () => {
    DOM.videoDropZone.classList.remove('drag-over');
});

DOM.videoDropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    DOM.videoDropZone.classList.remove('drag-over');
    handleVideoFiles(e.dataTransfer.files);
});

// BGMファイル
DOM.bgmInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleBGMFile(e.target.files[0]);
    }
});

DOM.bgmDropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    DOM.bgmDropZone.classList.add('drag-over');
});

DOM.bgmDropZone.addEventListener('dragleave', () => {
    DOM.bgmDropZone.classList.remove('drag-over');
});

DOM.bgmDropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    DOM.bgmDropZone.classList.remove('drag-over');
    if (e.dataTransfer.files.length > 0) {
        handleBGMFile(e.dataTransfer.files[0]);
    }
});

// BGM音量
DOM.bgmVolume.addEventListener('input', (e) => {
    DOM.bgmVolumeValue.textContent = `${e.target.value}%`;
});

// 処理実行
DOM.processBtn.addEventListener('click', processAllVideos);

// 一括ダウンロード
DOM.downloadAllBtn.addEventListener('click', downloadAllAsZip);

// ========================================
// 初期化
// ========================================
updateVideoList();
