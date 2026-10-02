            // CONTINUAÇÃO DE startCall
            const isVideo = type === 'video';
            
            document.getElementById('callPeerAvatar').innerText = targetName.charAt(0).toUpperCase();
            document.getElementById('callPeerName').innerText = targetName;
            document.getElementById('callStatusText').innerText = isVideo ? "A chamar (Vídeo)..." : "A chamar (Áudio)...";
            
            const audioPlaceholder = document.getElementById('audioCallPlaceholder');
            const audioName = document.getElementById('audioCallName');
            if (isVideo) {
                audioPlaceholder.classList.add('hidden');
            } else {
                audioPlaceholder.classList.remove('hidden');
                audioName.innerText = `Em chamada de áudio com ${targetName}`;
            }

            openModal('callModal');

            try {
                localStream = await navigator.mediaDevices.getUserMedia({
                    audio: true,
                    video: isVideo
                });

                document.getElementById('localVideo').srcObject = localStream;

                peerConnection = new RTCPeerConnection(rtcConfig);
                remoteStream = new MediaStream();
                document.getElementById('remoteVideo').srcObject = remoteStream;

                localStream.getTracks().forEach(track => {
                    peerConnection.addTrack(track, localStream);
                });

                peerConnection.ontrack = (event) => {
                    event.streams[0].getTracks().forEach(track => {
                        remoteStream.addTrack(track);
                    });
                };

                const callDocRef = doc(collection(db, "calls"));
                activeCallId = callDocRef.id;

                const callerCandidates = collection(callDocRef, "callerCandidates");
                const calleeCandidates = collection(callDocRef, "calleeCandidates");

                peerConnection.onicecandidate = (event) => {
                    if (event.candidate) {
                        addDoc(callerCandidates, event.candidate.toJSON());
                    }
                };

                const offerDescription = await peerConnection.createOffer();
                await peerConnection.setLocalDescription(offerDescription);

                const offer = {
                    sdp: offerDescription.sdp,
                    type: offerDescription.type,
                };

                await setDoc(callDocRef, {
                    callerId: currentUserId,
                    callerName: currentUserName,
                    calleeId: activeChatUserId,
                    calleeName: targetName,
                    type: type,
                    status: 'offered',
                    offer: offer,
                    createdAt: serverTimestamp()
                });

                unsubscribeCall = onSnapshot(callDocRef, (snapshot) => {
                    const data = snapshot.data();
                    if (!data) return;

                    if (peerConnection && !peerConnection.currentRemoteDescription && data.answer) {
                        const answerDescription = new RTCSessionDescription(data.answer);
                        peerConnection.setRemoteDescription(answerDescription);
                        document.getElementById('callStatusText').innerText = "Em chamada";
                        startCallTimer();
                    }

                    if (data.status === 'rejected') {
                        showToast("Chamada recusada.", "info");
                        cleanUpCall();
                    } else if (data.status === 'ended') {
                        showToast("Chamada terminada.", "info");
                        cleanUpCall();
                    }
                });

                unsubscribeCandidates = onSnapshot(calleeCandidates, (snapshot) => {
                    snapshot.docChanges().forEach((change) => {
                        if (change.type === 'added') {
                            const candidate = new RTCIceCandidate(change.doc.data());
                            peerConnection.addIceCandidate(candidate);
                        }
                    });
                });

            } catch (error) {
                console.error("Erro ao iniciar chamada:", error);
                showToast("Não foi possível aceder aos dispositivos de multimédia.", "error");
                cleanUpCall();
            }
        }

        function listenToIncomingCalls() {
            if (!currentUserId) return;
            const q = query(
                collection(db, "calls"),
                orderBy("createdAt", "desc"),
                limit(5)
            );

            onSnapshot(q, (snapshot) => {
                snapshot.docChanges().forEach((change) => {
                    if (change.type === 'added') {
                        const callData = change.doc.data();
                        const callId = change.doc.id;

                        if (callData.calleeId === currentUserId && callData.status === 'offered') {
                            incomingCallData = { id: callId, ...callData };
                            showIncomingCallModal(incomingCallData);
                        }
                    } else if (change.type === 'modified') {
                        const callData = change.doc.data();
                        if (incomingCallData && incomingCallData.id === change.doc.id && callData.status === 'ended') {
                            closeModal('incomingCallModal');
                            incomingCallData = null;
                        }
                    }
                });
            });
        }

        function showIncomingCallModal(callData) {
            document.getElementById('incomingCallerName').innerText = callData.callerName || "Utilizador";
            document.getElementById('incomingCallType').innerText = callData.type === 'video' 
                ? "A receber chamada de vídeo..." 
                : "A receber chamada de áudio...";
            
            const icon = document.getElementById('incomingCallIcon');
            if (icon) {
                icon.className = callData.type === 'video' ? "fa-solid fa-video text-3xl" : "fa-solid fa-phone-volume text-3xl";
            }

            playNotificationSound();
            openModal('incomingCallModal');
        }

        async function acceptIncomingCall() {
            if (!incomingCallData) return;
            const callData = incomingCallData;
            closeModal('incomingCallModal');

            const isVideo = callData.type === 'video';
            activeCallId = callData.id;

            document.getElementById('callPeerAvatar').innerText = (callData.callerName || "U").charAt(0).toUpperCase();
            document.getElementById('callPeerName').innerText = callData.callerName || "Utilizador";
            document.getElementById('callStatusText').innerText = "A ligar...";

            const audioPlaceholder = document.getElementById('audioCallPlaceholder');
            const audioName = document.getElementById('audioCallName');
            if (isVideo) {
                audioPlaceholder.classList.add('hidden');
            } else {
                audioPlaceholder.classList.remove('hidden');
                audioName.innerText = `Em chamada de áudio com ${callData.callerName}`;
            }

            openModal('callModal');

            try {
                localStream = await navigator.mediaDevices.getUserMedia({
                    audio: true,
                    video: isVideo
                });

                document.getElementById('localVideo').srcObject = localStream;

                peerConnection = new RTCPeerConnection(rtcConfig);
                remoteStream = new MediaStream();
                document.getElementById('remoteVideo').srcObject = remoteStream;

                localStream.getTracks().forEach(track => {
                    peerConnection.addTrack(track, localStream);
                });

                peerConnection.ontrack = (event) => {
                    event.streams[0].getTracks().forEach(track => {
                        remoteStream.addTrack(track);
                    });
                };

                const callDocRef = doc(db, "calls", activeCallId);
                const callerCandidates = collection(callDocRef, "callerCandidates");
                const calleeCandidates = collection(callDocRef, "calleeCandidates");

                peerConnection.onicecandidate = (event) => {
                    if (event.candidate) {
                        addDoc(calleeCandidates, event.candidate.toJSON());
                    }
                };

                await peerConnection.setRemoteDescription(new RTCSessionDescription(callData.offer));

                const answerDescription = await peerConnection.createAnswer();
                await peerConnection.setLocalDescription(answerDescription);

                const answer = {
                    type: answerDescription.type,
                    sdp: answerDescription.sdp,
                };

                await updateDoc(callDocRef, {
                    answer: answer,
                    status: 'answered'
                });

                document.getElementById('callStatusText').innerText = "Em chamada";
                startCallTimer();

                unsubscribeCandidates = onSnapshot(callerCandidates, (snapshot) => {
                    snapshot.docChanges().forEach((change) => {
                        if (change.type === 'added') {
                            const candidate = new RTCIceCandidate(change.doc.data());
                            peerConnection.addIceCandidate(candidate);
                        }
                    });
                });

                unsubscribeCall = onSnapshot(callDocRef, (snapshot) => {
                    const data = snapshot.data();
                    if (data && data.status === 'ended') {
                        showToast("A outra pessoa desligou a chamada.", "info");
                        cleanUpCall();
                    }
                });

            } catch (error) {
                console.error("Erro ao aceitar chamada:", error);
                showToast("Falha ao conectar dispositivo de multimédia.", "error");
                rejectIncomingCall();
            }
        }

        async function rejectIncomingCall() {
            if (!incomingCallData) return;
            try {
                await updateDoc(doc(db, "calls", incomingCallData.id), { status: 'rejected' });
            } catch (e) {}
            closeModal('incomingCallModal');
            incomingCallData = null;
        }

        async function endCall() {
            if (activeCallId) {
                try {
                    await updateDoc(doc(db, "calls", activeCallId), { status: 'ended' });
                } catch (e) {}
            }
            cleanUpCall();
        }

        function cleanUpCall() {
            if (callTimerInterval) clearInterval(callTimerInterval);
            callSeconds = 0;
            document.getElementById('callDuration').classList.add('hidden');
            document.getElementById('callDuration').innerText = "00:00";

            if (unsubscribeCall) { unsubscribeCall(); unsubscribeCall = null; }
            if (unsubscribeCandidates) { unsubscribeCandidates(); unsubscribeCandidates = null; }

            if (peerConnection) {
                peerConnection.close();
                peerConnection = null;
            }

            if (localStream) {
                localStream.getTracks().forEach(track => track.stop());
                localStream = null;
            }

            remoteStream = null;
            activeCallId = null;
            isMuted = false;
            isVideoOff = false;

            document.getElementById('muteBtn').classList.remove('bg-red-600');
            document.getElementById('muteBtn').classList.add('bg-slate-800');
            document.getElementById('videoToggleBtn').classList.remove('bg-red-600');
            document.getElementById('videoToggleBtn').classList.add('bg-slate-800');

            closeModal('callModal');
        }

        function startCallTimer() {
            const durationEl = document.getElementById('callDuration');
            durationEl.classList.remove('hidden');
            callSeconds = 0;
            if (callTimerInterval) clearInterval(callTimerInterval);

            callTimerInterval = setInterval(() => {
                callSeconds++;
                const mins = String(Math.floor(callSeconds / 60)).padStart(2, '0');
                const secs = String(callSeconds % 60).padStart(2, '0');
                durationEl.innerText = `${mins}:${secs}`;
            }, 1000);
        }

        function toggleMute() {
            if (!localStream) return;
            const audioTrack = localStream.getAudioTracks()[0];
            if (audioTrack) {
                isMuted = !isMuted;
                audioTrack.enabled = !isMuted;
                const muteBtn = document.getElementById('muteBtn');
                if (isMuted) {
                    muteBtn.classList.remove('bg-slate-800');
                    muteBtn.classList.add('bg-red-600');
                } else {
                    muteBtn.classList.remove('bg-red-600');
                    muteBtn.classList.add('bg-slate-800');
                }
            }
        }

        function toggleVideo() {
            if (!localStream) return;
            const videoTrack = localStream.getVideoTracks()[0];
            if (videoTrack) {
                isVideoOff = !isVideoOff;
                videoTrack.enabled = !isVideoOff;
                const videoBtn = document.getElementById('videoToggleBtn');
                if (isVideoOff) {
                    videoBtn.classList.remove('bg-slate-800');
                    videoBtn.classList.add('bg-red-600');
                } else {
                    videoBtn.classList.remove('bg-red-600');
                    videoBtn.classList.add('bg-slate-800');
                }
            }
        }

        // GESTÃO DE CONTEÚDO (FIRESTORE & STORAGE)
        function listenToDatabaseChanges() {
            const q = query(collection(db, "contents"), orderBy("createdAt", "desc"));
            onSnapshot(q, (snapshot) => {
                contents = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                renderContentGrid();
            });
        }

        function renderContentGrid() {
            const grid = document.getElementById('contentGrid');
            const emptyState = document.getElementById('emptyState');
            const counter = document.getElementById('contentCounter');
            if (!grid) return;

            let filtered = contents.filter(item => {
                const matchesFilter = currentFilter === 'all' || item.category === currentFilter;
                const matchesSearch = !searchQuery || 
                    (item.title && item.title.toLowerCase().includes(searchQuery)) ||
                    (item.description && item.description.toLowerCase().includes(searchQuery));
                return matchesFilter && matchesSearch;
            });

            if (counter) {
                counter.innerText = `${filtered.length} ${filtered.length === 1 ? 'recurso' : 'recursos'}`;
            }

            if (filtered.length === 0) {
                grid.innerHTML = '';
                if (emptyState) emptyState.classList.remove('hidden');
                return;
            }

            if (emptyState) emptyState.classList.add('hidden');

            grid.innerHTML = filtered.map(item => {
                const safeTitle = escapeHTML(item.title || 'Sem título');
                const safeDesc = escapeHTML(item.description || '');
                const dateStr = item.createdAt ? new Date(item.createdAt).toLocaleDateString() : '';
                const isOwner = item.userId === currentUserId;

                let mediaPreview = '';
                let categoryBadge = '';

                switch (item.category) {
                    case 'image':
                        categoryBadge = `<span class="px-2.5 py-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold rounded-full flex items-center gap-1"><i class="fa-solid fa-image"></i> Imagem</span>`;
                        mediaPreview = `
                            <div class="h-44 w-full bg-slate-900 overflow-hidden relative group">
                                <img src="${item.url}" alt="${safeTitle}" class="w-full h-full object-cover transition duration-300 group-hover:scale-105" loading="lazy" />
                            </div>`;
                        break;
                    case 'video':
                        categoryBadge = `<span class="px-2.5 py-1 bg-purple-500/10 text-purple-600 dark:text-purple-400 text-[10px] font-bold rounded-full flex items-center gap-1"><i class="fa-solid fa-video"></i> Vídeo</span>`;
                        mediaPreview = `
                            <div class="h-44 w-full bg-slate-950 flex items-center justify-center relative overflow-hidden group">
                                <video src="${item.url}" class="w-full h-full object-cover opacity-80" preload="metadata"></video>
                                <div class="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/10 transition">
                                    <div class="w-12 h-12 rounded-full bg-brand-600 text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition">
                                        <i class="fa-solid fa-play ml-1"></i>
                                    </div>
                                </div>
                            </div>`;
                        break;
                    case 'document':
                        categoryBadge = `<span class="px-2.5 py-1 bg-rose-500/10 text-rose-600 dark:text-rose-400 text-[10px] font-bold rounded-full flex items-center gap-1"><i class="fa-solid fa-file-pdf"></i> Documento</span>`;
                        mediaPreview = `
                            <div class="h-44 w-full bg-slate-100 dark:bg-slate-800/80 flex flex-col items-center justify-center p-4 border-b border-slate-200 dark:border-slate-700">
                                <i class="fa-solid fa-file-pdf text-5xl text-rose-500 mb-2"></i>
                                <span class="text-xs font-semibold text-slate-500 line-clamp-1 max-w-[80%]">${safeTitle}</span>
                            </div>`;
                        break;
                    case 'link':
                    default:
                        categoryBadge = `<span class="px-2.5 py-1 bg-sky-500/10 text-sky-600 dark:text-sky-400 text-[10px] font-bold rounded-full flex items-center gap-1"><i class="fa-solid fa-link"></i> Link</span>`;
                        mediaPreview = `
                            <div class="h-44 w-full bg-gradient-to-br from-brand-900 to-indigo-950 flex flex-col items-center justify-center p-4 text-white">
                                <i class="fa-solid fa-globe text-4xl text-brand-400 mb-2"></i>
                                <span class="text-xs font-mono opacity-80 truncate max-w-[80%]">${escapeHTML(item.url)}</span>
                            </div>`;
                        break;
                }

                return `
                    <div class="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700/80 shadow-sm hover:shadow-md transition overflow-hidden flex flex-col">
                        <div class="cursor-pointer" onclick="window.viewContent('${item.id}')">
                            ${mediaPreview}
                        </div>
                        <div class="p-4 flex-1 flex flex-col justify-between">
                            <div>
                                <div class="flex items-center justify-between gap-2 mb-2">
                                    ${categoryBadge}
                                    <span class="text-[10px] font-medium text-slate-400">${dateStr}</span>
                                </div>
                                <h4 class="font-bold text-sm line-clamp-1 text-slate-800 dark:text-slate-100 mb-1 cursor-pointer hover:text-brand-600 dark:hover:text-brand-400" onclick="window.viewContent('${item.id}')">${safeTitle}</h4>
                                <p class="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mb-3">${safeDesc || 'Sem descrição.'}</p>
                            </div>
                            <div class="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-700/60">
                                <span class="text-[11px] text-slate-400 truncate max-w-[120px]">Por: ${escapeHTML(item.userName || 'Anónimo')}</span>
                                <div class="flex items-center gap-2">
                                    <button onclick="window.viewContent('${item.id}')" class="px-3 py-1 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs font-medium rounded-lg transition">
                                        Ver
                                    </button>
                                    ${isOwner ? `
                                        <button onclick="window.deleteContent('${item.id}', '${item.storagePath || ''}')" class="p-1 text-slate-400 hover:text-red-500 transition" title="Eliminar">
                                            <i class="fa-solid fa-trash-can text-xs"></i>
                                        </button>
                                    ` : ''}
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }

        function viewContent(id) {
            const item = contents.find(c => c.id === id);
            if (!item) return;

            document.getElementById('viewTitle').innerText = item.title || 'Recurso';
            document.getElementById('viewCategoryDate').innerText = `${item.category.toUpperCase()} • ${item.createdAt ? new Date(item.createdAt).toLocaleDateString() : ''}`;
            document.getElementById('viewDescription').innerText = item.description || 'Sem descrição adicional.';
            
            const dlBtn = document.getElementById('viewDownloadBtn');
            dlBtn.href = item.url;

            const container = document.getElementById('viewContainer');
            container.innerHTML = '';

            switch (item.category) {
                case 'image':
                    container.innerHTML = `<img src="${item.url}" class="max-h-[60vh] max-w-full object-contain rounded-xl shadow-lg" alt="${escapeHTML(item.title)}" />`;
                    break;
                case 'video':
                    container.innerHTML = `<video src="${item.url}" controls autoplay class="max-h-[60vh] w-full rounded-xl shadow-lg"></video>`;
                    break;
                case 'document':
                    container.innerHTML = `<iframe src="${item.url}" class="w-full h-[60vh] rounded-xl border border-slate-700"></iframe>`;
                    break;
                case 'link':
                default:
                    container.innerHTML = `
                        <div class="text-center p-8">
                            <i class="fa-solid fa-globe text-6xl text-brand-500 mb-4 animate-pulse"></i>
                            <h4 class="text-lg font-bold mb-2">${escapeHTML(item.title)}</h4>
                            <a href="${item.url}" target="_blank" rel="noopener noreferrer" class="text-brand-400 underline font-mono text-sm break-all">${escapeHTML(item.url)}</a>
                        </div>`;
                    break;
            }

            openModal('viewContentModal');
        }

        async function deleteContent(id, storagePath) {
            if (!confirm("Tem a certeza de que deseja eliminar este conteúdo?")) return;

            try {
                await deleteDoc(doc(db, "contents", id));
                if (storagePath) {
                    const fileRef = ref(storage, storagePath);
                    await deleteObject(fileRef).catch(() => {});
                }
                showToast("Conteúdo eliminado.", "info");
            } catch (e) {
                showToast("Erro ao eliminar conteúdo.", "error");
            }
        }

        function switchAddTab(tab) {
            currentAddTab = tab;
            const tabUploadBtn = document.getElementById('tabUploadBtn');
            const tabLinkBtn = document.getElementById('tabLinkBtn');
            const uploadSection = document.getElementById('uploadSection');
            const linkSection = document.getElementById('linkSection');

            if (tab === 'upload') {
                uploadSection.classList.remove('hidden');
                linkSection.classList.add('hidden');
                tabUploadBtn.className = "py-2 text-xs font-semibold rounded-lg bg-white dark:bg-slate-800 shadow-sm text-brand-600 dark:text-brand-400 transition";
                tabLinkBtn.className = "py-2 text-xs font-semibold rounded-lg text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition";
            } else {
                uploadSection.classList.add('hidden');
                linkSection.classList.remove('hidden');
                tabLinkBtn.className = "py-2 text-xs font-semibold rounded-lg bg-white dark:bg-slate-800 shadow-sm text-brand-600 dark:text-brand-400 transition";
                tabUploadBtn.className = "py-2 text-xs font-semibold rounded-lg text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition";
                setCategoryUI('link');
            }
        }

        function setCategoryUI(cat) {
            const selectCategory = document.getElementById('selectCategory');
            if (selectCategory) selectCategory.value = cat;

            document.querySelectorAll('.cat-tile').forEach(tile => {
                if (tile.getAttribute('data-cat') === cat) {
                    tile.className = "cat-tile flex items-center gap-2.5 p-2.5 rounded-xl border-2 border-brand-500 bg-brand-50 dark:bg-brand-950/40 text-brand-600 dark:text-brand-400 font-semibold text-xs shadow-sm transition";
                } else {
                    tile.className = "cat-tile flex items-center gap-2.5 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 text-slate-600 dark:text-slate-300 font-medium text-xs hover:border-slate-300 dark:hover:border-slate-600 transition";
                }
            });
        }

        function handleFileSelect(e) {
            const file = e.target.files[0];
            if (!file) return;
            selectedFile = file;

            const nameDisplay = document.getElementById('fileNameDisplay');
            if (nameDisplay) nameDisplay.innerText = `Ficheiro selecionado: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`;

            if (file.type.startsWith('image/')) setCategoryUI('image');
            else if (file.type.startsWith('video/')) setCategoryUI('video');
            else if (file.type.includes('pdf')) setCategoryUI('document');
        }

        async function handleFormSubmit(e) {
            e.preventDefault();
            const title = document.getElementById('inputTitle').value.trim();
            const description = document.getElementById('inputDescription').value.trim();
            const category = document.getElementById('selectCategory').value;
            const submitBtn = document.getElementById('submitBtn');

            if (!title) {
                showToast("Por favor insira um título.", "error");
                return;
            }

            submitBtn.disabled = true;
            submitBtn.classList.add('opacity-50');

            if (currentAddTab === 'link') {
                const url = document.getElementById('inputUrl').value.trim();
                if (!url) {
                    showToast("Por favor insira o URL.", "error");
                    submitBtn.disabled = false;
                    submitBtn.classList.remove('opacity-50');
                    return;
                }

                try {
                    await addDoc(collection(db, "contents"), {
                        title: title,
                        description: description,
                        category: 'link',
                        url: url,
                        userId: currentUserId,
                        userName: currentUserName,
                        createdAt: new Date().toISOString()
                    });

                    showToast("Link adicionado com sucesso!", "success");
                    closeModal('addContentModal');
                    resetAddForm();
                } catch (err) {
                    showToast("Erro ao guardar link.", "error");
                } finally {
                    submitBtn.disabled = false;
                    submitBtn.classList.remove('opacity-50');
                }

            } else {
                if (!selectedFile) {
                    showToast("Por favor selecione um ficheiro local.", "error");
                    submitBtn.disabled = false;
                    submitBtn.classList.remove('opacity-50');
                    return;
                }

                const progressContainer = document.getElementById('uploadProgressContainer');
                const progressBar = document.getElementById('uploadProgressBar');
                const percentText = document.getElementById('uploadPercent');
                progressContainer.classList.remove('hidden');

                const storagePath = `uploads/${Date.now()}_${selectedFile.name}`;
                const fileRef = ref(storage, storagePath);
                activeUploadTask = uploadBytesResumable(fileRef, selectedFile);

                activeUploadTask.on('state_changed', 
                    (snapshot) => {
                        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                        progressBar.style.width = `${progress}%`;
                        percentText.innerText = `${Math.round(progress)}%`;
                    }, 
                    (error) => {
                        showToast("Erro no carregamento do ficheiro.", "error");
                        progressContainer.classList.add('hidden');
                        submitBtn.disabled = false;
                        submitBtn.classList.remove('opacity-50');
                    }, 
                    async () => {
                        const downloadURL = await getDownloadURL(activeUploadTask.snapshot.ref);

                        await addDoc(collection(db, "contents"), {
                            title: title,
                            description: description,
                            category: category,
                            url: downloadURL,
                            storagePath: storagePath,
                            userId: currentUserId,
                            userName: currentUserName,
                            createdAt: new Date().toISOString()
                        });

                        showToast("Ficheiro enviado com sucesso!", "success");
                        progressContainer.classList.add('hidden');
                        closeModal('addContentModal');
                        resetAddForm();
                        submitBtn.disabled = false;
                        submitBtn.classList.remove('opacity-50');
                    }
                );
            }
        }

        function resetAddForm() {
            document.getElementById('addContentForm').reset();
            document.getElementById('fileNameDisplay').innerText = "Clique para selecionar imagem, vídeo ou PDF";
            selectedFile = null;
            activeUploadTask = null;
            switchAddTab('upload');
            setCategoryUI('image');
        }

        // UTILITÁRIOS DE TEMA E MODAL
        function toggleDarkMode() {
            const html = document.documentElement;
            const themeIcon = document.getElementById('themeIcon');
            if (html.classList.contains('dark')) {
                html.classList.remove('dark');
                localStorage.setItem('theme', 'light');
                if (themeIcon) themeIcon.className = "fa-solid fa-sun text-lg";
            } else {
                html.classList.add('dark');
                localStorage.setItem('theme', 'dark');
                if (themeIcon) themeIcon.className = "fa-solid fa-moon text-lg";
            }
        }

        function initTheme() {
            const savedTheme = localStorage.getItem('theme');
            const themeIcon = document.getElementById('themeIcon');
            if (savedTheme === 'light') {
                document.documentElement.classList.remove('dark');
                if (themeIcon) themeIcon.className = "fa-solid fa-sun text-lg";
            } else {
                document.documentElement.classList.add('dark');
                if (themeIcon) themeIcon.className = "fa-solid fa-moon text-lg";
            }
        }

        function openModal(id) {
            const modal = document.getElementById(id);
            if (!modal) return;
            modal.classList.remove('opacity-0', 'pointer-events-none');
            const child = modal.firstElementChild;
            if (child) child.classList.remove('scale-95');
        }

        function closeModal(id) {
            const modal = document.getElementById(id);
            if (!modal) return;
            modal.classList.add('opacity-0', 'pointer-events-none');
            const child = modal.firstElementChild;
            if (child) child.classList.add('scale-95');

            if (id === 'chatModal') {
                unreadMessagesCount = 0;
                updateUnreadBadge();
            }
        }

        function escapeHTML(str) {
            if (!str) return '';
            return str.replace(/[&<>'"]/g, 
                tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
            );
        }

        function resetFilters() {
            currentFilter = 'all';
            searchQuery = '';
            const searchInput = document.getElementById('searchInput');
            if (searchInput) searchInput.value = '';

            document.querySelectorAll('.filter-btn').forEach(btn => {
                if (btn.getAttribute('data-filter') === 'all') {
                    btn.className = "filter-btn active px-4 py-2 rounded-xl text-sm font-medium transition bg-brand-600 text-white";
                } else {
                    btn.className = "filter-btn px-4 py-2 rounded-xl text-sm font-medium transition bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700";
                }
            });

            renderContentGrid();
        }

        // EVENT LISTENERS DE INICIALIZAÇÃO
        document.addEventListener('DOMContentLoaded', () => {
            initTheme();
            initHoldToRecordAudio();

            const themeBtn = document.getElementById('themeToggleBtn');
            if (themeBtn) themeBtn.addEventListener('click', toggleDarkMode);

            const searchInput = document.getElementById('searchInput');
            if (searchInput) {
                searchInput.addEventListener('input', (e) => {
                    searchQuery = e.target.value.toLowerCase().trim();
                    renderContentGrid();
                });
            }

            document.querySelectorAll('.filter-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    currentFilter = btn.getAttribute('data-filter');
                    document.querySelectorAll('.filter-btn').forEach(b => {
                        b.className = "filter-btn px-4 py-2 rounded-xl text-sm font-medium transition bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700";
                    });
                    btn.className = "filter-btn active px-4 py-2 rounded-xl text-sm font-medium transition bg-brand-600 text-white";
                    renderContentGrid();
                });
            });
        });

        // EXPOSIÇÃO GLOBAL DE FUNÇÕES (WINDOW)
        window.openModal = openModal;
        window.closeModal = closeModal;
        window.switchAuthTab = switchAuthTab;
        window.handleLogin = handleLogin;
        window.handleRegister = handleRegister;
        window.handlePasswordReset = handlePasswordReset;
        window.handleAnonymousLogin = handleAnonymousLogin;
        window.handleAuthAction = handleAuthAction;
        window.requestNotificationPermission = requestNotificationPermission;
        window.searchUsers = searchUsers;
        window.updateMyName = updateMyName;
        window.startChatWith = startChatWith;
        window.openNicknameModal = openNicknameModal;
        window.saveUserNickname = saveUserNickname;
        window.backToUsersList = backToUsersList;
        window.sendChatMessage = sendChatMessage;
        window.handleTypingInput = handleTypingInput;
        window.editMessage = editMessage;
        window.switchAddTab = switchAddTab;
        window.setCategoryUI = setCategoryUI;
        window.handleFileSelect = handleFileSelect;
        window.handleFormSubmit = handleFormSubmit;
        window.viewContent = viewContent;
        window.deleteContent = deleteContent;
        window.resetFilters = resetFilters;
        window.startCall = startCall;
        window.acceptIncomingCall = acceptIncomingCall;
        window.rejectIncomingCall = rejectIncomingCall;
        window.endCall = endCall;
        window.toggleMute = toggleMute;
        window.toggleVideo = toggleVideo;
        window.toggleDarkMode = toggleDarkMode;

    </script>
</body>
</html>


