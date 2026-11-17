import { useState, useEffect } from 'react';
import Keycloak from 'keycloak-js';
import './App.css';

// Kết nối qua cổng 8000 của Kong
const keycloak = new Keycloak({
  url: 'http://localhost:8000/auth',
  realm: 'unirequest',
  clientId: 'unirequest-portal'
});

function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [userInfo, setUserInfo] = useState(null);
  const [requests, setRequests] = useState([]);
  const [title, setTitle] = useState('');

  useEffect(() => {
    keycloak.init({ onLoad: 'check-sso' }).then((auth) => {
      setAuthenticated(auth);
      if (auth) {
        keycloak.loadUserInfo().then((info) => setUserInfo(info));
      }
    });
  }, []);

  const login = () => keycloak.login();
  const logout = () => keycloak.logout();

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!title) return;
    const newReq = { id: Date.now(), title, status: 'Chờ duyệt', creator: userInfo?.preferred_username };
    setRequests([newReq, ...requests]);
    setTitle('');
  };

  return (
    <div style={{ padding: '40px', fontFamily: 'sans-serif', maxWidth: '800px', margin: '0 auto' }}>
      <h1>UniRequest Portal</h1>
      
      {!authenticated ? (
        <div>
          <p>Vui lòng đăng nhập để sử dụng hệ thống.</p>
          <button onClick={login} style={{ padding: '10px 20px', background: '#0066cc', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>
            Đăng nhập qua Keycloak (SSO)
          </button>
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f0f0f0', padding: '10px 20px', borderRadius: '8px' }}>
            <div>
              <strong>Xin chào, {userInfo?.preferred_username}!</strong> 
              <span style={{ marginLeft: '10px', color: '#666' }}>({userInfo?.email})</span>
            </div>
            <button onClick={logout} style={{ padding: '5px 10px', background: '#cc0000', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>Đăng xuất</button>
          </div>

          <div style={{ marginTop: '30px', padding: '20px', border: '1px solid #ddd', borderRadius: '8px' }}>
            <h3>Tạo yêu cầu mới</h3>
            <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '10px' }}>
              <input 
                type="text" 
                placeholder="Nhập nội dung yêu cầu (VD: Xin giấy xác nhận)..." 
                value={title} 
                onChange={(e) => setTitle(e.target.value)}
                style={{ flex: 1, padding: '10px', border: '1px solid #ccc', borderRadius: '5px' }}
              />
              <button type="submit" style={{ padding: '10px 20px', background: '#28a745', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>Gửi</button>
            </form>
          </div>

          <div style={{ marginTop: '30px' }}>
            <h3>Danh sách yêu cầu</h3>
            {requests.length === 0 ? <p>Chưa có yêu cầu nào.</p> : (
              <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '10px' }}>
                <thead>
                  <tr style={{ background: '#eee', textAlign: 'left' }}>
                    <th style={{ padding: '10px', borderBottom: '2px solid #ddd' }}>Người gửi</th>
                    <th style={{ padding: '10px', borderBottom: '2px solid #ddd' }}>Nội dung</th>
                    <th style={{ padding: '10px', borderBottom: '2px solid #ddd' }}>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map(r => (
                    <tr key={r.id} style={{ borderBottom: '1px solid #ddd' }}>
                      <td style={{ padding: '10px' }}>{r.creator}</td>
                      <td style={{ padding: '10px' }}>{r.title}</td>
                      <td style={{ padding: '10px', color: 'orange' }}>{r.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
