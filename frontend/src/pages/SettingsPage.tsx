import { Camera, Save } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, apiRequest, mediaUrl } from '../api/client';
import { useAuth, type AuthUser } from '../auth/AuthProvider';
import { cropAvatarToSquare } from '../images/crop-square';

export function SettingsPage() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [username, setUsername] = useState(user?.username ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;

  const save = async (event: FormEvent) => {
    event.preventDefault(); setPending(true); setError(null); setMessage(null);
    const nextUsername = username.trim().toLowerCase();
    try {
      const input: { displayName: string; bio: string; username?: string } = { displayName, bio };
      if (nextUsername !== user.username) input.username = nextUsername;
      const result = await apiRequest<{ user: AuthUser }>('/users/me', { method: 'PATCH', body: JSON.stringify(input) });
      await refresh();
      setMessage('Профиль сохранён.');
      if (result.user.username !== user.username) navigate(`/profile/${result.user.username}`);
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : 'Не удалось сохранить профиль.'); }
    finally { setPending(false); }
  };

  const uploadAvatar = async (file: File | undefined) => {
    if (!file) return;
    setPending(true); setError(null); setMessage(null);
    try {
      const squareAvatar = await cropAvatarToSquare(file);
      await apiRequest('/users/me/avatar', { method: 'POST', headers: { 'content-type': squareAvatar.type }, body: squareAvatar });
      await refresh(); setMessage('Фотография профиля обновлена.');
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : 'Не удалось загрузить фотографию.'); }
    finally { setPending(false); }
  };

  const avatar = mediaUrl(user.avatarKey);
  return <section className="surface-page narrow-page settings-page">
    <header className="page-heading"><div><p className="eyebrow">Ваш аккаунт</p><h1>Настройки профиля</h1></div></header>
    <div className="avatar-editor">{avatar ? <img src={avatar} alt="Фотография профиля" /> : <span className="avatar profile-avatar">{user.displayName.slice(0, 1).toUpperCase()}</span>}<label className="secondary-button"><Camera size={17} />Изменить фото<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" hidden onChange={(event) => void uploadAvatar(event.target.files?.[0])} /></label></div>
    <form className="settings-form" onSubmit={(event) => void save(event)}>
      <label><span>Отображаемое имя</span><input required maxLength={80} value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
      <label><span>Имя пользователя</span><input required minLength={3} maxLength={30} pattern="[A-Za-z0-9_]+" disabled={!user.usernameChangeAvailable} value={username} onChange={(event) => setUsername(event.target.value)} /><small>{user.usernameChangeAvailable ? 'После регистрации username можно изменить только один раз.' : 'Вы уже использовали единственную смену username.'}</small></label>
      <label><span>О себе</span><textarea maxLength={500} value={bio} onChange={(event) => setBio(event.target.value)} /><small>{bio.length} / 500</small></label>
      {error && <p className="form-error" role="alert">{error}</p>}{message && <p className="form-success">{message}</p>}
      <button className="primary-button" disabled={pending} type="submit"><Save size={17} />{pending ? 'Сохраняем…' : 'Сохранить'}</button>
    </form>
  </section>;
}
