import { useSession } from "../session";

export function LoginPage() {
  const { login, error, devPlayers } = useSession();

  return (
    <div className="login">
      <div className="login-card">
        <img src="/favicon.svg" alt="" width={64} height={64} />
        <h1>Drzewo to Drzewo</h1>
        <p className="muted">Hide-and-seek with trees in Park Południowy.</p>
        {devPlayers ? (
          <>
            <p className="small muted">Local test mode – who are you?</p>
            <div className="stack">
              {devPlayers.map((p) => (
                <button key={p} className="btn primary big" onClick={() => login(p)}>
                  Play as {p}
                </button>
              ))}
            </div>
          </>
        ) : (
          <button className="btn primary big" onClick={() => login()}>
            Log in
          </button>
        )}
        {error && <p className="error small">{error}</p>}
      </div>
    </div>
  );
}
